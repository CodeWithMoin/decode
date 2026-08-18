import asyncio
import json

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..api import actor_id, idempotency_key
from ..db import SessionLocal, get_session
from ..domain import idempotent_replay, save_idempotency
from ..models import (
    Artifact,
    ArtifactDependency,
    ArtifactType,
    ArtifactVersion,
    ExecutionStatus,
    Job,
    JobInput,
    ProductionTask,
    ProjectEvent,
    Run,
    Source,
    SourceStatus,
    UsageRecord,
)
from ..problems import AppProblem
from ..projects.router import project_or_404
from ..schemas import (
    AcceptSceneCandidate,
    CancelRun,
    GenerateBrief,
    GenerateSceneVisuals,
    GenerateScript,
    GenerateTeachingPlan,
    GenerateVoice,
    RegenerateSceneVisual,
    RetryRun,
)
from .graph import (
    SCENE_TASK,
    accept_scene_candidate,
    cancel_run_graph,
    is_graph_job,
    scene_candidate_projection,
    task_projection,
)
from .pipeline import create_job, start_run

router = APIRouter(prefix="/projects/{project_id}", tags=["execution"])


async def verify_intent_informed(
    session: AsyncSession,
    project_id: str,
    *,
    intent_version_id: str,
    informed_child_version_id: str,
    informed_noun: str,
) -> None:
    """Confirm the named intent is a production intent that informed the approved input.

    Every generation command needs the same gate: the intent in the command must
    be a real production intent, and it must be the one recorded as informing the
    approved brief/plan/script this stage builds on. It was pasted inline four
    times; a drift in any one copy is a version-confusion hole, so it lives here.
    """
    intent_artifact_type = await session.scalar(
        select(Artifact.artifact_type)
        .join(ArtifactVersion, ArtifactVersion.artifact_id == Artifact.id)
        .where(Artifact.project_id == project_id, ArtifactVersion.id == intent_version_id)
    )
    if intent_artifact_type != ArtifactType.PRODUCTION_INTENT:
        raise AppProblem(
            400, "invalid_command", "intent_version_id must be a production intent version."
        )
    informed_by_intent = await session.scalar(
        select(ArtifactDependency.parent_version_id).where(
            ArtifactDependency.child_version_id == informed_child_version_id,
            ArtifactDependency.role == "production_intent",
        )
    )
    if informed_by_intent != intent_version_id:
        raise AppProblem(
            409,
            "artifact_version_conflict",
            f"Use the production direction that informed the approved {informed_noun}.",
            approved_intent_version_id=informed_by_intent,
        )


async def job_or_404(session: AsyncSession, project_id: str, job_id: str) -> Job:
    job = await session.scalar(select(Job).where(Job.id == job_id, Job.project_id == project_id))
    if not job:
        raise AppProblem(404, "job_not_found", "Job not found.")
    return job


def job_projection(
    job: Job,
    run: Run | None,
    inputs: list[JobInput],
    tasks: list[ProductionTask] | None = None,
) -> dict:
    return {
        "job_id": job.id,
        "project_id": job.project_id,
        "kind": job.kind,
        "status": job.status,
        "active_run_id": job.active_run_id,
        "requested_input_versions": [{"version_id": i.version_id, "role": i.role} for i in inputs],
        "result_artifact_version_id": job.result_artifact_version_id,
        "failure": job.failure,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "active_run": None
        if not run
        else {
            "run_id": run.id,
            "attempt": run.attempt,
            "status": run.status,
            "context_manifest": run.context_manifest,
            "failure": run.failure,
        },
        "tasks": [task_projection(task) for task in tasks or []],
    }


@router.post("/production-brief/generations", status_code=202)
async def generate(
    project_id: str,
    command: GenerateBrief,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    await project_or_404(session, project_id)
    if len(command.source_version_ids) != len(set(command.source_version_ids)):
        raise AppProblem(
            422,
            "validation_failed",
            "source_version_ids must not contain duplicates.",
            field_errors=[
                {
                    "type": "value_error",
                    "loc": ["body", "source_version_ids"],
                    "msg": "source_version_ids must not contain duplicates",
                    "input": command.source_version_ids,
                }
            ],
        )
    actor, scope, raw = actor_id(), f"generate_brief:{project_id}", command.model_dump(mode="json")
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])
    ids = set(command.source_version_ids + [command.intent_version_id])
    versions = list(
        (
            await session.scalars(
                select(ArtifactVersion)
                .join(Artifact, ArtifactVersion.artifact_id == Artifact.id)
                .where(Artifact.project_id == project_id, ArtifactVersion.id.in_(ids))
            )
        ).all()
    )
    found = {v.id: v for v in versions}
    if set(found) != ids:
        raise AppProblem(
            400, "invalid_command", "Every requested input version must belong to the project."
        )
    artifact_types = {}
    for version in versions:
        input_artifact = await session.get(Artifact, version.artifact_id)
        assert input_artifact is not None
        artifact_types[version.id] = input_artifact.artifact_type
    if artifact_types.get(command.intent_version_id) != "production_intent" or any(
        artifact_types.get(v) != "source" for v in command.source_version_ids
    ):
        raise AppProblem(
            400,
            "invalid_command",
            "Input versions do not match the required source and production intent roles.",
        )
    ready_source_versions = set(
        (
            await session.scalars(
                select(Source.version_id).where(
                    Source.project_id == project_id,
                    Source.status == SourceStatus.READY,
                    Source.version_id.in_(command.source_version_ids),
                )
            )
        ).all()
    )
    if ready_source_versions != set(command.source_version_ids):
        raise AppProblem(400, "invalid_command", "Every source input must be ready.")
    manifest = {
        "source_version_ids": command.source_version_ids,
        "intent_version_id": command.intent_version_id,
        "schema": 1,
    }
    job, run = await create_job(
        session,
        project_id,
        "generate_production_brief",
        inputs=[(v, "source") for v in command.source_version_ids]
        + [(command.intent_version_id, "production_intent")],
        manifest=manifest,
        message="Producer queued",
    )
    body = {
        "job_id": job.id,
        "run_id": run.id,
        "status": "queued",
        "kind": job.kind,
        "requested_input_versions": manifest,
    }
    save_idempotency(session, actor, scope, key, raw, 202, body)
    await session.commit()
    return body


@router.post("/teaching-plan/generations", status_code=202)
async def generate_plan(
    project_id: str,
    command: GenerateTeachingPlan,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    """Ask the Director to shape an approved brief into a Teaching Plan."""
    await project_or_404(session, project_id)
    actor, scope, raw = actor_id(), f"generate_plan:{project_id}", command.model_dump(mode="json")
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])

    brief_artifact = await session.scalar(
        select(Artifact).where(
            Artifact.project_id == project_id,
            Artifact.artifact_type == ArtifactType.PRODUCTION_BRIEF,
        )
    )
    # The approved version, not the latest. This is the first place the approved
    # pointer does work rather than just being recorded: a creator who edited the
    # brief but has not approved the edit gets the version they signed off on,
    # and planning against an unreviewed draft is refused rather than silently
    # allowed.
    if not brief_artifact or not brief_artifact.approved_version_id:
        raise AppProblem(
            409,
            "brief_not_approved",
            "Approve the Production Brief before planning the video.",
        )
    if brief_artifact.approved_version_id != command.brief_version_id:
        raise AppProblem(
            409,
            "artifact_version_conflict",
            "That Production Brief version is not the approved one.",
            approved_version_id=brief_artifact.approved_version_id,
        )

    await verify_intent_informed(
        session,
        project_id,
        intent_version_id=command.intent_version_id,
        informed_child_version_id=command.brief_version_id,
        informed_noun="brief",
    )

    manifest = {
        "brief_version_id": command.brief_version_id,
        "intent_version_id": command.intent_version_id,
        "schema": 1,
    }
    job, run = await create_job(
        session,
        project_id,
        "generate_teaching_plan",
        inputs=[
            (command.brief_version_id, "production_brief"),
            (command.intent_version_id, "production_intent"),
        ],
        manifest=manifest,
        message="Director queued",
    )
    body = {
        "job_id": job.id,
        "run_id": run.id,
        "status": ExecutionStatus.QUEUED,
        "kind": job.kind,
        "requested_input_versions": manifest,
    }
    save_idempotency(session, actor, scope, key, raw, 202, body)
    await session.commit()
    return body


@router.post("/script/generations", status_code=202)
async def generate_script(
    project_id: str,
    command: GenerateScript,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    """Ask the Writer to turn an approved Teaching Plan into narration."""
    await project_or_404(session, project_id)
    actor, scope, raw = actor_id(), f"generate_script:{project_id}", command.model_dump(mode="json")
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])

    plan_artifact = await session.scalar(
        select(Artifact).where(
            Artifact.project_id == project_id,
            Artifact.artifact_type == ArtifactType.TEACHING_PLAN,
        )
    )
    # The approved version, not the latest — same rule the Teaching Plan applies
    # to the brief. Writing against a plan the creator has not signed off on
    # would spend a script on beats that may still move.
    if not plan_artifact or not plan_artifact.approved_version_id:
        raise AppProblem(
            409,
            "plan_not_approved",
            "Approve the Teaching Plan before writing the script.",
        )
    if plan_artifact.approved_version_id != command.plan_version_id:
        raise AppProblem(
            409,
            "artifact_version_conflict",
            "That Teaching Plan version is not the approved one.",
            approved_version_id=plan_artifact.approved_version_id,
        )

    await verify_intent_informed(
        session,
        project_id,
        intent_version_id=command.intent_version_id,
        informed_child_version_id=command.plan_version_id,
        informed_noun="plan",
    )

    manifest = {
        "plan_version_id": command.plan_version_id,
        "intent_version_id": command.intent_version_id,
        "schema": 1,
    }
    job, run = await create_job(
        session,
        project_id,
        "generate_script",
        inputs=[
            (command.plan_version_id, "teaching_plan"),
            (command.intent_version_id, "production_intent"),
        ],
        manifest=manifest,
        message="Writer queued",
    )
    body = {
        "job_id": job.id,
        "run_id": run.id,
        "status": ExecutionStatus.QUEUED,
        "kind": job.kind,
        "requested_input_versions": manifest,
    }
    save_idempotency(session, actor, scope, key, raw, 202, body)
    await session.commit()
    return body


@router.post("/scene-visuals/generations", status_code=202)
async def generate_scene_visuals(
    project_id: str,
    command: GenerateSceneVisuals,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    """Ask the Motion Designer to turn an approved Script into scene visuals."""
    await project_or_404(session, project_id)
    actor, scope, raw = (
        actor_id(),
        f"generate_scene_visuals:{project_id}",
        command.model_dump(mode="json"),
    )
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])

    script_artifact = await session.scalar(
        select(Artifact).where(
            Artifact.project_id == project_id,
            Artifact.artifact_type == ArtifactType.SCRIPT,
        )
    )
    if not script_artifact or not script_artifact.approved_version_id:
        raise AppProblem(
            409, "script_not_approved", "Approve the Script before designing the visuals."
        )
    if script_artifact.approved_version_id != command.script_version_id:
        raise AppProblem(
            409,
            "artifact_version_conflict",
            "That Script version is not the approved one.",
            approved_version_id=script_artifact.approved_version_id,
        )

    # The plan travels with the script rather than being named separately: the
    # Visualizer needs what a beat teaches as well as what is said over it, and
    # the only plan it may read is the one that script was written from.
    plan_version_id = await session.scalar(
        select(ArtifactDependency.parent_version_id).where(
            ArtifactDependency.child_version_id == command.script_version_id,
            ArtifactDependency.role == "teaching_plan",
        )
    )
    if plan_version_id is None:
        raise AppProblem(
            409, "artifact_version_conflict", "The approved Script has no Teaching Plan recorded."
        )

    await verify_intent_informed(
        session,
        project_id,
        intent_version_id=command.intent_version_id,
        informed_child_version_id=command.script_version_id,
        informed_noun="script",
    )

    manifest = {
        "script_version_id": command.script_version_id,
        "teaching_plan_version_id": plan_version_id,
        "intent_version_id": command.intent_version_id,
        "schema": 1,
    }
    job, run = await create_job(
        session,
        project_id,
        "generate_scene_visuals",
        inputs=[
            (command.script_version_id, "script"),
            (plan_version_id, "teaching_plan"),
            (command.intent_version_id, "production_intent"),
        ],
        manifest=manifest,
        message="Motion Designer queued",
    )
    body = {
        "job_id": job.id,
        "run_id": run.id,
        "status": ExecutionStatus.QUEUED,
        "kind": job.kind,
        "requested_input_versions": manifest,
    }
    save_idempotency(session, actor, scope, key, raw, 202, body)
    await session.commit()
    return body


@router.post("/scene-visuals/regenerations", status_code=202)
async def regenerate_scene_visual(
    project_id: str,
    command: RegenerateSceneVisual,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    """Redraw one scene under a creator's direction — the per-scene direction loop.

    Only the named beat's module changes; every other scene is carried through and
    the result publishes as one new scene_visuals version. This is not the full
    generation and it does not chain: voice, approvals and the plan are untouched.
    The script, plan and intent it reads are the ones that produced the version the
    creator is editing, resolved from that version's lineage.
    """
    await project_or_404(session, project_id)
    actor, scope, raw = (
        actor_id(),
        f"regenerate_scene_visual:{project_id}",
        command.model_dump(mode="json"),
    )
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])

    visuals_artifact = await session.scalar(
        select(Artifact).where(
            Artifact.project_id == project_id,
            Artifact.artifact_type == ArtifactType.SCENE_VISUALS,
        )
    )
    if not visuals_artifact or not visuals_artifact.latest_version_id:
        raise AppProblem(
            409, "scene_visuals_not_ready", "Build the scenes before directing one of them."
        )
    # Direct the scenes the creator is actually looking at. A newer set means the
    # direction was written against a stale cut, so refuse rather than redraw the
    # wrong version.
    if visuals_artifact.latest_version_id != command.scene_visuals_version_id:
        raise AppProblem(
            409,
            "artifact_version_conflict",
            "These scenes have changed since you started. Refresh and direct the current cut.",
            latest_version_id=visuals_artifact.latest_version_id,
        )

    # The script, plan and intent that produced this cut — resolved from its own
    # lineage so the redraw reads exactly what the whole set was built from, and
    # the creator never re-picks inputs the scenes already carry.
    parents = {
        role: parent
        for role, parent in (
            await session.execute(
                select(ArtifactDependency.role, ArtifactDependency.parent_version_id).where(
                    ArtifactDependency.child_version_id == command.scene_visuals_version_id,
                    ArtifactDependency.role.in_(("script", "teaching_plan", "production_intent")),
                )
            )
        ).all()
    }
    missing = sorted({"script", "teaching_plan", "production_intent"} - parents.keys())
    if missing:
        raise AppProblem(
            409,
            "artifact_version_conflict",
            "These scenes are missing the lineage needed to redraw one of them.",
        )

    manifest = {
        "scene_visuals_version_id": command.scene_visuals_version_id,
        "script_version_id": parents["script"],
        "teaching_plan_version_id": parents["teaching_plan"],
        "intent_version_id": parents["production_intent"],
        "beat_id": command.beat_id,
        "direction": command.direction,
        "schema": 1,
    }
    job, run = await create_job(
        session,
        project_id,
        "regenerate_scene_visual",
        inputs=[
            (parents["script"], "script"),
            (parents["teaching_plan"], "teaching_plan"),
            (parents["production_intent"], "production_intent"),
            (command.scene_visuals_version_id, "scene_visuals"),
        ],
        manifest=manifest,
        message="Motion Designer redrawing one scene",
    )
    body = {
        "job_id": job.id,
        "run_id": run.id,
        "status": ExecutionStatus.QUEUED,
        "kind": job.kind,
        "requested_input_versions": manifest,
    }
    save_idempotency(session, actor, scope, key, raw, 202, body)
    await session.commit()
    return body


@router.post("/voice/generations", status_code=202)
async def generate_voice(
    project_id: str,
    command: GenerateVoice,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    """Ask the Narrator to read the approved Script aloud."""
    await project_or_404(session, project_id)
    actor, scope, raw = (
        actor_id(),
        f"generate_voice:{project_id}",
        command.model_dump(mode="json"),
    )
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])

    script_artifact = await session.scalar(
        select(Artifact).where(
            Artifact.project_id == project_id,
            Artifact.artifact_type == ArtifactType.SCRIPT,
        )
    )
    if not script_artifact or not script_artifact.approved_version_id:
        raise AppProblem(
            409, "script_not_approved", "Approve the Script before recording the narration."
        )
    if script_artifact.approved_version_id != command.script_version_id:
        raise AppProblem(
            409,
            "artifact_version_conflict",
            "That Script version is not the approved one.",
            approved_version_id=script_artifact.approved_version_id,
        )

    await verify_intent_informed(
        session,
        project_id,
        intent_version_id=command.intent_version_id,
        informed_child_version_id=command.script_version_id,
        informed_noun="script",
    )

    manifest = {
        "script_version_id": command.script_version_id,
        "intent_version_id": command.intent_version_id,
        "schema": 1,
    }
    job, run = await create_job(
        session,
        project_id,
        "generate_voice",
        inputs=[
            (command.script_version_id, "script"),
            (command.intent_version_id, "production_intent"),
        ],
        manifest=manifest,
        message="Narrator queued",
    )
    body = {
        "job_id": job.id,
        "run_id": run.id,
        "status": ExecutionStatus.QUEUED,
        "kind": job.kind,
        "requested_input_versions": manifest,
    }
    save_idempotency(session, actor, scope, key, raw, 202, body)
    await session.commit()
    return body


@router.get("/jobs/{job_id}")
async def job_detail(project_id: str, job_id: str, session: AsyncSession = Depends(get_session)):
    job = await job_or_404(session, project_id, job_id)
    run = await session.get(Run, job.active_run_id) if job.active_run_id else None
    inputs = list((await session.scalars(select(JobInput).where(JobInput.job_id == job.id))).all())
    tasks = (
        list(
            (
                await session.scalars(
                    select(ProductionTask)
                    .where(ProductionTask.run_id == run.id)
                    .order_by(ProductionTask.priority.desc(), ProductionTask.created_at)
                )
            ).all()
        )
        if run
        else []
    )
    return job_projection(job, run, inputs, tasks)


@router.get("/jobs/{job_id}/scene-candidates")
async def scene_candidates(
    project_id: str,
    job_id: str,
    session: AsyncSession = Depends(get_session),
):
    job = await job_or_404(session, project_id, job_id)
    if not is_graph_job(job.kind) or not job.active_run_id:
        return {"items": []}
    tasks = list(
        (
            await session.scalars(
                select(ProductionTask)
                .where(
                    ProductionTask.run_id == job.active_run_id,
                    ProductionTask.kind == SCENE_TASK,
                    ProductionTask.output.is_not(None),
                )
                .order_by(ProductionTask.priority.desc())
            )
        ).all()
    )
    return {"items": [scene_candidate_projection(task) for task in tasks]}


@router.post("/jobs/{job_id}/scene-candidates/{task_id}/acceptances")
async def accept_candidate(
    project_id: str,
    job_id: str,
    task_id: str,
    command: AcceptSceneCandidate,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    actor = actor_id()
    scope = f"accept_scene_candidate:{project_id}:{job_id}:{task_id}"
    raw = command.model_dump(mode="json")
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])
    await project_or_404(session, project_id)
    try:
        body = await accept_scene_candidate(
            session,
            project_id,
            job_id,
            task_id,
            command.component_source,
        )
    except ValueError as exc:
        raise AppProblem(409, "scene_candidate_conflict", str(exc)) from exc
    save_idempotency(session, actor, scope, key, raw, 200, body)
    await session.commit()
    return body


@router.post("/jobs/{job_id}/cancellations")
async def cancel_job(
    project_id: str,
    job_id: str,
    command: CancelRun,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    """Cancel a graph run and make every late task delivery harmless."""
    actor, scope, raw = actor_id(), f"cancel:{job_id}", command.model_dump(mode="json")
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])
    job = await session.scalar(
        select(Job)
        .where(Job.id == job_id, Job.project_id == project_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if job is None:
        raise AppProblem(404, "job_not_found", "Job not found.")
    if not is_graph_job(job.kind):
        raise AppProblem(409, "job_not_cancellable", "This production step cannot be cancelled.")
    if job.active_run_id != command.expected_active_run_id:
        raise AppProblem(409, "run_already_active", "Another run is already active.")
    run = await session.scalar(
        select(Run)
        .where(Run.id == command.expected_active_run_id, Run.job_id == job.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if run is None:
        raise AppProblem(409, "run_already_active", "The expected run is not active.")
    if run.status not in {ExecutionStatus.QUEUED, ExecutionStatus.RUNNING}:
        raise AppProblem(409, "run_not_cancellable", "This run has already finished.")
    await cancel_run_graph(session, job, run)
    body = {"job_id": job.id, "run_id": run.id, "status": ExecutionStatus.CANCELLED}
    save_idempotency(session, actor, scope, key, raw, 200, body)
    await session.commit()
    return body


@router.post("/jobs/{job_id}/retries", status_code=202)
async def retry(
    project_id: str,
    job_id: str,
    command: RetryRun,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    actor, scope, raw = actor_id(), f"retry:{job_id}", command.model_dump(mode="json")
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])
    job = await session.scalar(
        select(Job)
        .where(Job.id == job_id, Job.project_id == project_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not job:
        raise AppProblem(404, "job_not_found", "Job not found.")
    previous = await session.scalar(
        select(Run)
        .where(Run.id == command.expected_failed_run_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not previous or previous.job_id != job.id or previous.status != ExecutionStatus.FAILED:
        raise AppProblem(
            409, "run_already_active", "The expected run is not the failed active run."
        )
    if job.active_run_id != previous.id or job.status != ExecutionStatus.FAILED:
        raise AppProblem(409, "run_already_active", "Another run is already active.")
    run = await start_run(
        session,
        job,
        manifest=previous.context_manifest,
        # The previous attempt's hash, not a fresh one: a retry that recomputed
        # it would look like a different request over the same inputs.
        context_hash=previous.context_hash,
        message="Retry queued",
    )
    attempt = run.attempt
    body = {"job_id": job.id, "run_id": run.id, "status": "queued", "attempt": attempt}
    save_idempotency(session, actor, scope, key, raw, 202, body)
    await session.commit()
    return body


@router.get("/jobs/{job_id}/usage")
async def usage(project_id: str, job_id: str, session: AsyncSession = Depends(get_session)):
    await job_or_404(session, project_id, job_id)
    rows = list(
        (
            await session.scalars(
                select(UsageRecord)
                .where(UsageRecord.job_id == job_id)
                .order_by(UsageRecord.created_at)
            )
        ).all()
    )
    return {
        "job_id": job_id,
        "items": [
            {
                "usage_id": r.id,
                "provider": r.provider,
                "operation": r.operation,
                "model": r.model,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "duration_ms": r.duration_ms,
                # null, never the string "None": an unpriced run has to stay
                # distinguishable from a free one on the client too.
                "estimated_cost_usd": (
                    None if r.estimated_cost_usd is None else str(r.estimated_cost_usd)
                ),
                "run_id": r.run_id,
                "artifact_version_id": r.artifact_version_id,
                "created_at": r.created_at,
            }
            for r in rows
        ],
    }


@router.get("/events/stream")
async def events(
    project_id: str,
    request: Request,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
):
    async with SessionLocal() as initial_session:
        await project_or_404(initial_session, project_id)
    try:
        after = int(last_event_id or request.query_params.get("after", "0"))
    except ValueError as exc:
        raise AppProblem(400, "invalid_command", "Last-Event-ID must be an integer.") from exc

    async def stream():
        cursor, idle = after, 0
        while not await request.is_disconnected():
            async with SessionLocal() as poll_session:
                rows = list(
                    (
                        await poll_session.scalars(
                            select(ProjectEvent)
                            .where(ProjectEvent.project_id == project_id, ProjectEvent.id > cursor)
                            .order_by(ProjectEvent.id)
                            .limit(100)
                        )
                    ).all()
                )
            if rows:
                idle = 0
                for event in rows:
                    cursor = event.id
                    payload = {
                        "id": event.id,
                        "type": event.type,
                        "project_id": event.project_id,
                        "job_id": event.job_id,
                        "run_id": event.run_id,
                        "artifact_id": event.artifact_id,
                        "artifact_version_id": event.artifact_version_id,
                        "occurred_at": event.occurred_at.isoformat(),
                        "data": event.data,
                    }
                    yield f"id: {event.id}\nevent: {event.type}\ndata: {json.dumps(payload)}\n\n"
            else:
                idle += 1
                if idle % 15 == 0:
                    yield ": keep-alive\n\n"
                await asyncio.sleep(1)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
