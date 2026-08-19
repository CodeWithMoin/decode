"""Durable task graphs for work that can run scene by scene.

The first graph keeps the existing Job/Run and immutable artifact contracts: one
scene task per plan beat fans out, then an assembly task validates and publishes
the same whole `scene_visuals` artifact existing clients already consume.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import timedelta
from time import perf_counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents.registry import visualizer
from ..agents.renderer.validation import validate_scenes
from ..agents.renderer.vision import vision_verdict
from ..config import get_settings
from ..db import SessionLocal, utcnow
from ..domain import emit, publish_version
from ..models import (
    Artifact,
    ArtifactVersion,
    ExecutionStatus,
    Job,
    JobInput,
    OutboxEvent,
    ProductionTask,
    ProductionTaskDependency,
    Project,
    ProjectStatus,
    Run,
    TaskStatus,
    UsageRecord,
)
from ..pricing import resolve_cost
from ..schemas import SceneModule, SceneVisuals
from .context import VisualizerContext, context_assembler
from .pipeline import continue_chain, stage_for, stage_provider
from .throttle import model_call_gate

SCENE_TASK = "design_scene"
ASSEMBLY_TASK = "assemble_scene_visuals"
GRAPH_JOB_KINDS = frozenset({"generate_scene_visuals"})

# A RUNNING task older than this is considered abandoned by a dead worker and
# may be re-claimed. 2x the arq job_timeout (worker.py) so a live attempt that
# is merely slow can never be stolen while its worker still holds it.
logger = logging.getLogger(__name__)

STALE_TASK_LEASE_SECONDS = 600
# Wall-clock bound on one scene-generation model call, below arq's job_timeout
# so exhaustion surfaces as an ordinary Exception that _fail_task can retry —
# arq's own timeout is a BaseException that leaks the RUNNING row instead.
SCENE_GENERATION_TIMEOUT_SECONDS = 240


def is_graph_job(kind: str) -> bool:
    return kind in GRAPH_JOB_KINDS


async def _visualizer_context(
    session: AsyncSession, job: Job, run: Run
) -> tuple[VisualizerContext, list[JobInput]]:
    inputs = list((await session.scalars(select(JobInput).where(JobInput.job_id == job.id))).all())
    versions = {
        version.id: version
        for version in (
            await session.scalars(
                select(ArtifactVersion).where(
                    ArtifactVersion.id.in_([item.version_id for item in inputs])
                )
            )
        ).all()
    }
    context = context_assembler.assemble(
        stage_for(job.kind), inputs, versions, run.context_manifest
    )
    if not isinstance(context, VisualizerContext):
        raise ValueError(f"{job.kind} did not assemble a visualizer context")
    return context, inputs


def _task_outbox(task: ProductionTask) -> OutboxEvent:
    return OutboxEvent(
        topic="task.execute",
        aggregate_id=task.id,
        payload={"task_id": task.id, "attempt": task.attempt},
        priority=task.priority,
    )


async def start_scene_graph(run_id: str) -> dict:
    """Create scene nodes once and queue every initially-ready node atomically."""
    async with SessionLocal() as session:
        run = await session.scalar(select(Run).where(Run.id == run_id).with_for_update())
        if run is None:
            return {"status": "missing"}
        job = await session.scalar(select(Job).where(Job.id == run.job_id).with_for_update())
        assert job is not None
        if job.active_run_id != run.id:
            return {"status": "stale_run"}
        if run.status == ExecutionStatus.CANCELLED:
            return {"status": "cancelled"}
        existing = list(
            (
                await session.scalars(
                    select(ProductionTask).where(ProductionTask.run_id == run.id)
                )
            ).all()
        )
        if existing:
            # Resume must actually resume: a QUEUED task whose arq job was lost
            # (Redis flush, dropped publish) or a RUNNING task whose worker died
            # would otherwise sit unclaimed forever while the project shows
            # "processing". Re-outboxing is idempotent — the job id is
            # task:{id}:attempt:{n} — so re-queuing live work is harmless.
            requeued = 0
            stale_before = utcnow() - timedelta(seconds=STALE_TASK_LEASE_SECONDS)
            for task in existing:
                if task.status == TaskStatus.RUNNING and (
                    task.started_at is None or task.started_at < stale_before
                ):
                    task.status = TaskStatus.QUEUED
                    task.started_at = None
                if task.status == TaskStatus.QUEUED:
                    session.add(_task_outbox(task))
                    requeued += 1
            if requeued:
                await session.commit()
            return {"status": "graph_running", "task_ids": [task.id for task in existing]}

        context, _ = await _visualizer_context(session, job, run)
        scene_tasks = [
            ProductionTask(
                run_id=run.id,
                kind=SCENE_TASK,
                stable_key=f"scene:{beat.id}",
                status=TaskStatus.QUEUED,
                priority=1000 - index,
                attempt=1,
                max_attempts=2,
                input={"beat_id": beat.id},
            )
            for index, beat in enumerate(context.plan.beats)
        ]
        assembly = ProductionTask(
            run_id=run.id,
            kind=ASSEMBLY_TASK,
            stable_key="scene_visuals:assemble",
            status=TaskStatus.PENDING,
            priority=0,
            # Assembly failing once must not discard every generated scene:
            # a transient DB/object-store blip deserves one more try.
            max_attempts=2,
            input={},
        )
        session.add_all([*scene_tasks, assembly])
        await session.flush()
        session.add_all(
            [
                ProductionTaskDependency(
                    task_id=assembly.id, prerequisite_task_id=scene_task.id
                )
                for scene_task in scene_tasks
            ]
        )
        for task in scene_tasks:
            session.add(_task_outbox(task))
            await emit(
                session,
                job.project_id,
                "production.task.queued",
                job_id=job.id,
                run_id=run.id,
                data={
                    "task_id": task.id,
                    "kind": task.kind,
                    "beat_id": task.input["beat_id"],
                    "priority": task.priority,
                    "attempt": task.attempt,
                    "message": f"Motion Designer queued for {task.input['beat_id']}",
                },
            )
        await emit(
            session,
            job.project_id,
            "production.graph.started",
            job_id=job.id,
            run_id=run.id,
            data={
                "scene_count": len(scene_tasks),
                "task_count": len(scene_tasks) + 1,
                "message": f"Designing {len(scene_tasks)} scenes in parallel",
            },
        )
        await session.commit()
        return {
            "status": "scheduled",
            "task_ids": [task.id for task in scene_tasks],
            "assembly_task_id": assembly.id,
        }


async def _claim_task(task_id: str, expected_attempt: int) -> tuple[str, str] | dict:
    async with SessionLocal() as session:
        task = await session.scalar(
            select(ProductionTask).where(ProductionTask.id == task_id).with_for_update()
        )
        if task is None:
            return {"status": "missing"}
        run = await session.scalar(select(Run).where(Run.id == task.run_id).with_for_update())
        assert run is not None
        job = await session.scalar(select(Job).where(Job.id == run.job_id).with_for_update())
        assert job is not None
        if job.active_run_id != run.id:
            return {"status": "stale_run"}
        if task.attempt != expected_attempt:
            return {"status": "stale_task"}
        if task.status == TaskStatus.SUCCEEDED:
            return {"status": "already_succeeded"}
        if task.status == TaskStatus.CANCELLED or run.status == ExecutionStatus.CANCELLED:
            return {"status": "cancelled"}
        if task.status == TaskStatus.RUNNING:
            # A worker that died mid-task (SIGKILL, or arq's job_timeout
            # cancelling the coroutine as a BaseException) leaves the row
            # RUNNING with nobody working on it. Redelivery may claim it back
            # once the lease is stale; otherwise the build would wait forever.
            stale_before = utcnow() - timedelta(seconds=STALE_TASK_LEASE_SECONDS)
            if task.started_at is not None and task.started_at >= stale_before:
                return {"status": task.status}
            task.started_at = None
        elif task.status != TaskStatus.QUEUED:
            return {"status": task.status}
        task.status = TaskStatus.RUNNING
        task.started_at = task.started_at or utcnow()
        task.finished_at = None
        task.failure = None
        await emit(
            session,
            job.project_id,
            "production.task.started",
            job_id=job.id,
            run_id=run.id,
            data={
                "task_id": task.id,
                "kind": task.kind,
                "beat_id": task.input.get("beat_id"),
                "attempt": task.attempt,
                "message": (
                    f"Designing {task.input['beat_id']}"
                    if task.kind == SCENE_TASK
                    else "Assembling the production"
                ),
            },
        )
        await session.commit()
        return task.kind, run.id


async def _run_scene_task(task_id: str, run_id: str) -> dict:
    async with SessionLocal() as session:
        task = await session.get(ProductionTask, task_id)
        run = await session.get(Run, run_id)
        assert task is not None and run is not None
        job = await session.get(Job, run.job_id)
        assert job is not None
        context, _ = await _visualizer_context(session, job, run)
        beat_id = str(task.input["beat_id"])
        beat = next((item for item in context.plan.beats if item.id == beat_id), None)
        narration = next((item for item in context.script.beats if item.beat_id == beat_id), None)
        if beat is None or narration is None:
            raise ValueError(
                f"scene task input {beat_id!r} is absent from the approved plan or script"
            )
        focused_plan = context.plan.model_copy(update={"beats": [beat]})
        focused_script = context.script.model_copy(update={"beats": [narration]})
        intent = context.intent
        repair = task.input.get("repair")

    # Never hold a database transaction open across a provider call. Cancellation
    # can update the task while generation is in flight; the completion check then
    # discards the late result.
    designer = visualizer(get_settings())
    started = perf_counter()
    # Timeout applies to the wait for a slot too — a task queued behind a full
    # gate must not outlive arq's job_timeout holding a RUNNING row.
    async with asyncio.timeout(SCENE_GENERATION_TIMEOUT_SECONDS), model_call_gate():
        if repair:
            # This attempt exists because the last one ALMOST passed: repair
            # that source against the recorded violations rather than rolling
            # fresh — only the failure reason should change.
            prior = SceneVisuals.model_validate(repair["visuals"]).scenes
            direction = (
                "Fix exactly these deterministic validation violations and change "
                "nothing else about the scene:\n"
                + "\n".join(f"- {item['code']}: {item['message']}" for item in repair["violations"])
            )
            visuals = await designer.regenerate_one(
                intent, focused_plan, focused_script, prior, beat_id, direction
            )
        else:
            visuals = await designer.generate(intent, focused_plan, focused_script)
    generation_ms = int((perf_counter() - started) * 1000)
    if len(visuals.scenes) != 1 or visuals.scenes[0].beat_id != beat_id:
        raise ValueError(f"scene task {beat_id!r} must return exactly its requested scene")

    # The vision loop: render what a viewer would see and let a multimodal
    # model judge it. One repair round on a fail; a second fail ships anyway —
    # the static gates already passed, and the creator can re-direct the scene.
    # "No opinion" (gate off, no key, tooling trouble) changes nothing.
    verdict = await vision_verdict(
        get_settings(),
        visuals.scenes[0],
        beat,
        narration.narration,
        float(beat.target_duration_seconds or 10),
    )
    if verdict is not None and not verdict.passes and verdict.fix_direction.strip():
        async with asyncio.timeout(SCENE_GENERATION_TIMEOUT_SECONDS), model_call_gate():
            repaired = await designer.regenerate_one(
                intent,
                focused_plan,
                focused_script,
                list(visuals.scenes),
                beat_id,
                "A reviewer looked at the rendered frames. Fix exactly this and "
                f"change nothing else:\n{verdict.fix_direction}",
            )
        if len(repaired.scenes) == 1 and repaired.scenes[0].beat_id == beat_id:
            visuals = repaired

    usage = getattr(designer, "last_usage", None)
    return {
        "visuals": visuals.model_dump(mode="json"),
        "department": designer.identifier,
        "usage": {
            "model": usage.model if usage else None,
            "input_tokens": usage.input_tokens if usage else None,
            "output_tokens": usage.output_tokens if usage else None,
            "cost_usd": usage.cost_usd if usage else None,
            "duration_ms": generation_ms,
        },
    }


async def _schedule_assembly(session: AsyncSession, run: Run, job: Job) -> None:
    assembly = await session.scalar(
        select(ProductionTask)
        .where(
            ProductionTask.run_id == run.id,
            ProductionTask.kind == ASSEMBLY_TASK,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if assembly is None or assembly.status != TaskStatus.PENDING:
        return
    scene_tasks = list(
        (
            await session.scalars(
                select(ProductionTask).where(
                    ProductionTask.run_id == run.id,
                    ProductionTask.kind == SCENE_TASK,
                )
            )
        ).all()
    )
    if not scene_tasks or any(
        task.status != TaskStatus.SUCCEEDED or task.accepted_at is None for task in scene_tasks
    ):
        return
    assembly.status = TaskStatus.QUEUED
    assembly.attempt = 1
    session.add(_task_outbox(assembly))
    await emit(
        session,
        job.project_id,
        "production.task.queued",
        job_id=job.id,
        run_id=run.id,
        data={
            "task_id": assembly.id,
            "kind": assembly.kind,
            "priority": assembly.priority,
            "attempt": assembly.attempt,
            "message": "Editor queued to assemble the scenes",
        },
    )


async def _complete_scene_task(
    task_id: str, expected_attempt: int, output: dict
) -> dict:
    async with SessionLocal() as session:
        task = await session.scalar(
            select(ProductionTask).where(ProductionTask.id == task_id).with_for_update()
        )
        assert task is not None
        run = await session.scalar(select(Run).where(Run.id == task.run_id).with_for_update())
        assert run is not None
        job = await session.scalar(select(Job).where(Job.id == run.job_id).with_for_update())
        assert job is not None
        if job.active_run_id != run.id or task.attempt != expected_attempt:
            return {"status": "stale_task"}
        if task.status == TaskStatus.CANCELLED or run.status == ExecutionStatus.CANCELLED:
            return {"status": "cancelled"}
        if task.status != TaskStatus.RUNNING:
            return {"status": task.status}
        # v1 auto-accepts below, so this is the last gate with a retry left:
        # run the same focused validation the human accept path runs, instead
        # of deferring to assembly where max_attempts can't heal a bad scene.
        scene_visuals = SceneVisuals.model_validate(output["visuals"])
        context, _ = await _visualizer_context(session, job, run)
        beat_id = str(task.input["beat_id"])
        beat = next((item for item in context.plan.beats if item.id == beat_id), None)
        if beat is not None:
            violations = validate_scenes(
                scene_visuals.scenes, context.plan.model_copy(update={"beats": [beat]})
            )
            if violations:
                # Keep the near-miss: the retry repairs THIS source against THESE
                # violations instead of regenerating from scratch — the failure
                # reason is the only thing that should change.
                task.input = {
                    **task.input,
                    "repair": {"visuals": output["visuals"], "violations": violations},
                }
                await session.commit()
                codes = ", ".join(item["code"] for item in violations)
                raise ValueError(f"scene {beat_id!r} failed validation before auto-accept: {codes}")
        task.output = output
        task.status = TaskStatus.SUCCEEDED
        task.finished_at = utcnow()
        await emit(
            session,
            job.project_id,
            "production.task.succeeded",
            job_id=job.id,
            run_id=run.id,
            data={
                "task_id": task.id,
                "kind": task.kind,
                "beat_id": task.input.get("beat_id"),
                "attempt": task.attempt,
                "message": f"Scene ready for {task.input['beat_id']}",
            },
        )
        await emit(
            session,
            job.project_id,
            "production.scene.candidate.ready",
            job_id=job.id,
            run_id=run.id,
            data={
                "task_id": task.id,
                "beat_id": task.input.get("beat_id"),
                "message": f"Scene candidate ready for {task.input['beat_id']}",
            },
        )
        # v1 topic-driven build: accept each scene as it lands so assembly — and
        # the chained voiceover — run without per-scene clicks. The generated
        # component_source is kept verbatim; the review loop still lets the
        # creator re-direct any scene afterwards.
        task.accepted_at = utcnow()
        await _schedule_assembly(session, run, job)
        await session.commit()
        return {"status": "candidate_ready", "task_id": task.id}


async def accept_scene_candidate(
    session: AsyncSession,
    project_id: str,
    job_id: str,
    task_id: str,
    component_source: str,
) -> dict:
    """Accept exactly the scene the creator previewed, then release fan-in if ready."""
    task = await session.scalar(
        select(ProductionTask).where(ProductionTask.id == task_id).with_for_update()
    )
    if task is None or task.kind != SCENE_TASK:
        raise ValueError("scene candidate not found")
    run = await session.scalar(select(Run).where(Run.id == task.run_id).with_for_update())
    assert run is not None
    job = await session.scalar(
        select(Job)
        .where(Job.id == job_id, Job.project_id == project_id, Job.id == run.job_id)
        .with_for_update()
    )
    if job is None:
        raise ValueError("scene candidate not found")
    if job.active_run_id != run.id or run.status != ExecutionStatus.RUNNING:
        raise ValueError("the scene candidate is no longer active")
    if task.status != TaskStatus.SUCCEEDED or task.output is None:
        raise ValueError("the scene candidate is not ready")

    visuals = SceneVisuals.model_validate(task.output["visuals"])
    if len(visuals.scenes) != 1:
        raise ValueError("a scene candidate must contain exactly one scene")
    prior = visuals.scenes[0]
    if task.accepted_at is not None:
        if prior.component_source != component_source:
            raise ValueError("the scene candidate was already accepted")
        return scene_candidate_projection(task)

    candidate = prior.model_copy(update={"component_source": component_source})
    context, _ = await _visualizer_context(session, job, run)
    beat_id = str(task.input["beat_id"])
    beat = next((item for item in context.plan.beats if item.id == beat_id), None)
    if beat is None:
        raise ValueError("the scene candidate no longer matches the plan")
    focused_plan = context.plan.model_copy(update={"beats": [beat]})
    violations = validate_scenes([candidate], focused_plan)
    if violations:
        codes = ", ".join(item["code"] for item in violations)
        raise ValueError(f"scene candidate failed validation: {codes}")

    task.output = {
        **task.output,
        "visuals": visuals.model_copy(update={"scenes": [candidate]}).model_dump(mode="json"),
    }
    task.accepted_at = utcnow()
    await emit(
        session,
        project_id,
        "production.scene.candidate.accepted",
        job_id=job.id,
        run_id=run.id,
        data={
            "task_id": task.id,
            "beat_id": beat_id,
            "message": f"Scene accepted for {beat_id}",
        },
    )
    await _schedule_assembly(session, run, job)
    return scene_candidate_projection(task)


def scene_candidate_projection(task: ProductionTask) -> dict:
    visuals = SceneVisuals.model_validate((task.output or {})["visuals"])
    return {
        "task_id": task.id,
        "beat_id": str(task.input["beat_id"]),
        "accepted_at": task.accepted_at.isoformat() if task.accepted_at else None,
        "scene": visuals.scenes[0].model_dump(mode="json"),
        "rationale": visuals.rationale,
    }


async def _run_assembly_task(task_id: str, run_id: str, expected_attempt: int) -> dict:
    async with SessionLocal() as session:
        task = await session.scalar(
            select(ProductionTask).where(ProductionTask.id == task_id).with_for_update()
        )
        run = await session.scalar(select(Run).where(Run.id == run_id).with_for_update())
        assert task is not None and run is not None
        job = await session.scalar(select(Job).where(Job.id == run.job_id).with_for_update())
        assert job is not None
        if job.active_run_id != run.id or task.attempt != expected_attempt:
            return {"status": "stale_task"}
        if task.status == TaskStatus.CANCELLED or run.status == ExecutionStatus.CANCELLED:
            return {"status": "cancelled"}
        context, inputs = await _visualizer_context(session, job, run)
        scene_tasks = list(
            (
                await session.scalars(
                    select(ProductionTask).where(
                        ProductionTask.run_id == run.id,
                        ProductionTask.kind == SCENE_TASK,
                    )
                )
            ).all()
        )
        by_beat = {
            str(scene_task.input["beat_id"]): scene_task
            for scene_task in scene_tasks
            if (
                scene_task.status == TaskStatus.SUCCEEDED
                and scene_task.accepted_at is not None
                and scene_task.output is not None
            )
        }
        if set(by_beat) != {beat.id for beat in context.plan.beats}:
            raise ValueError("scene assembly started before every scene candidate was accepted")
        payloads = [by_beat[beat.id].output or {} for beat in context.plan.beats]
        visuals = SceneVisuals(
            rationale=(
                f"I designed {len(payloads)} scenes independently and assembled them in the "
                "approved teaching order."
            ),
            scenes=[
                SceneVisuals.model_validate(payload["visuals"]).scenes[0] for payload in payloads
            ],
            visual_findings={
                "parallel": True,
                "fixture": all(
                    bool(payload["visuals"].get("visual_findings", {}).get("fixture"))
                    for payload in payloads
                ),
                "scene_tasks": [by_beat[beat.id].id for beat in context.plan.beats],
            },
        )
        violations = validate_scenes(visuals.scenes, context.plan)
        if violations:
            codes = ", ".join(item["code"] for item in violations)
            raise ValueError(f"assembled scene visuals failed validation: {codes}")

        stage = stage_for(job.kind)
        artifact = await session.scalar(
            select(Artifact).where(
                Artifact.project_id == job.project_id,
                Artifact.artifact_type == stage.produces,
            )
        )
        if artifact is None:
            artifact = Artifact(
                project_id=job.project_id,
                artifact_type=stage.produces,
                stable_key="default",
            )
            session.add(artifact)
            await session.flush()
        version = await publish_version(
            session,
            artifact,
            payload=visuals.model_dump(mode="json"),
            owner_role=stage.owner_role,
            created_by=f"run:{run.id}",
            run_id=run.id,
            supersedes_latest=True,
            rationale=f"{stage.produces} assembled from {len(scene_tasks)} parallel scene tasks.",
            parents=[(item.version_id, item.role) for item in inputs],
            schema_version=stage.schema_version,
        )
        settings = get_settings()
        for scene_task in scene_tasks:
            result = scene_task.output or {}
            usage = result.get("usage", {})
            session.add(
                UsageRecord(
                    job_id=job.id,
                    run_id=run.id,
                    artifact_version_id=version.id,
                    provider=stage_provider(settings, job.kind),
                    operation="scene_visual_generation",
                    model=result.get("department"),
                    input_tokens=usage.get("input_tokens"),
                    output_tokens=usage.get("output_tokens"),
                    duration_ms=usage.get("duration_ms"),
                    estimated_cost_usd=resolve_cost(
                        usage.get("cost_usd"),
                        usage.get("model"),
                        usage.get("input_tokens"),
                        usage.get("output_tokens"),
                    ),
                )
            )
        task.output = {"artifact_version_id": version.id}
        task.status = TaskStatus.SUCCEEDED
        task.finished_at = utcnow()
        run.status = ExecutionStatus.SUCCEEDED
        run.finished_at = utcnow()
        job.status = ExecutionStatus.SUCCEEDED
        job.result_artifact_version_id = version.id
        job.finished_at = utcnow()
        project = await session.scalar(
            select(Project).where(Project.id == job.project_id).with_for_update()
        )
        assert project is not None
        project.status = ProjectStatus.READY
        chained = await continue_chain(session, job, artifact, version)
        await emit(
            session,
            job.project_id,
            "artifact.version.created",
            job_id=job.id,
            run_id=run.id,
            artifact_id=artifact.id,
            version_id=version.id,
            data={"artifact_type": stage.produces, "sequence": version.sequence},
        )
        await emit(
            session,
            job.project_id,
            "production.task.succeeded",
            job_id=job.id,
            run_id=run.id,
            artifact_id=artifact.id,
            version_id=version.id,
            data={
                "task_id": task.id,
                "kind": task.kind,
                "attempt": task.attempt,
                "message": "Scenes assembled into the production",
            },
        )
        await emit(
            session,
            job.project_id,
            "artifact.ready_for_review",
            job_id=job.id,
            run_id=run.id,
            artifact_id=artifact.id,
            version_id=version.id,
            data={
                "message": f"{stage.label} ready for review",
                "artifact_type": stage.produces,
                "evaluation_decision": None,
                "auto_approved": chained is not None,
                "continued_job_id": chained.id if chained else None,
            },
        )
        await emit(
            session,
            job.project_id,
            "job.succeeded",
            job_id=job.id,
            run_id=run.id,
            artifact_id=artifact.id,
            version_id=version.id,
            data={"message": f"{stage.label} complete", "artifact_type": stage.produces},
        )
        await session.commit()
        return {"status": "succeeded", "version_id": version.id}


def _degraded_scene_output(beat_id: str, title: str) -> dict:
    """A minimal valid scene standing in for one that exhausted its retries.

    It passes the same static validation as generated scenes (relational
    primitives, transparent root, type floors, no controls) so assembly and
    the chained voice stage proceed; the creator re-directs just this scene
    instead of losing the whole build.
    """
    source = (
        "import { AbsoluteFill, Stack, Label } from '@decode/animation-api';\n\n"
        "export default function Scene() {\n"
        "  return (\n"
        "    <AbsoluteFill style={{ display: 'flex', alignItems: 'center',"
        " justifyContent: 'center' }}>\n"
        "      <Stack gap={28} align=\"center\">\n"
        f"        <Label text={json.dumps(title)} size={{72}} maxWidth={{1500}} color=\"#F5F5F5\" />\n"
        "        <Label text=\"This scene needs another pass — direct it in the chat to"
        " rebuild it.\" size={24} maxWidth={1300} color=\"#B8B8B8\" />\n"
        "      </Stack>\n"
        "    </AbsoluteFill>\n"
        "  );\n"
        "}\n"
    )
    visuals = SceneVisuals(
        scenes=[SceneModule(beat_id=beat_id, controls=[], component_source=source)],
        rationale=(
            "Placeholder for a scene that exhausted its retries; it holds the slot "
            "so assembly and voice proceed, and is meant to be re-directed."
        ),
    )
    return {
        "visuals": visuals.model_dump(mode="json"),
        "department": "decode/degraded-scene",
        "degraded": True,
        "usage": {"model": None, "input_tokens": None, "output_tokens": None, "duration_ms": 0},
    }


async def _fail_task(task_id: str, expected_attempt: int) -> dict:
    async with SessionLocal() as session:
        task = await session.scalar(
            select(ProductionTask).where(ProductionTask.id == task_id).with_for_update()
        )
        assert task is not None
        run = await session.scalar(select(Run).where(Run.id == task.run_id).with_for_update())
        assert run is not None
        job = await session.scalar(select(Job).where(Job.id == run.job_id).with_for_update())
        assert job is not None
        if (
            job.active_run_id != run.id
            or task.attempt != expected_attempt
            or task.status == TaskStatus.CANCELLED
            or run.status == ExecutionStatus.CANCELLED
        ):
            return {"status": "stale_task"}
        retryable = task.attempt < task.max_attempts
        failure = {
            "code": f"{task.kind}_failed",
            "message": (
                f"Scene design failed for {task.input.get('beat_id')}."
                if task.kind == SCENE_TASK
                else "Scene assembly failed."
            ),
            "retryable": retryable,
        }
        task.failure = failure
        if retryable:
            task.attempt += 1
            task.status = TaskStatus.QUEUED
            task.started_at = None
            task.finished_at = None
            session.add(_task_outbox(task))
            await emit(
                session,
                job.project_id,
                "production.task.retrying",
                job_id=job.id,
                run_id=run.id,
                data={
                    "task_id": task.id,
                    "kind": task.kind,
                    "beat_id": task.input.get("beat_id"),
                    "attempt": task.attempt,
                    "message": f"Retrying {task.input.get('beat_id', 'scene assembly')}",
                },
            )
            await session.commit()
            return {"status": "retrying", "attempt": task.attempt}

        if task.kind == SCENE_TASK:
            # Retries exhausted for one scene: continue with a placeholder
            # instead of discarding every sibling's finished work. The scene
            # is marked degraded so the chat can say exactly which beat needs
            # re-direction; assembly and the chained voice stage proceed.
            context, _ = await _visualizer_context(session, job, run)
            beat_id = str(task.input.get("beat_id", ""))
            beat = next((item for item in context.plan.beats if item.id == beat_id), None)
            task.output = _degraded_scene_output(beat_id, beat.title if beat else "This scene")
            task.status = TaskStatus.SUCCEEDED
            task.finished_at = utcnow()
            task.accepted_at = utcnow()
            await emit(
                session,
                job.project_id,
                "production.scene.degraded",
                job_id=job.id,
                run_id=run.id,
                data={
                    "task_id": task.id,
                    "beat_id": beat_id,
                    "message": (
                        f"Scene {beat_id} couldn't pass its checks after retries — "
                        "a placeholder holds its slot so the rest of the video finishes."
                    ),
                },
            )
            await _schedule_assembly(session, run, job)
            await session.commit()
            return {"status": "degraded", "task_id": task.id}

        task.status = TaskStatus.FAILED
        task.finished_at = utcnow()
        run.status = ExecutionStatus.FAILED
        run.failure = failure
        run.finished_at = utcnow()
        job.status = ExecutionStatus.FAILED
        job.failure = failure
        job.finished_at = utcnow()
        project = await session.get(Project, job.project_id)
        assert project is not None
        project.status = ProjectStatus.FAILED
        unfinished = list(
            (
                await session.scalars(
                    select(ProductionTask).where(
                        ProductionTask.run_id == run.id,
                        ProductionTask.status.in_(
                            [TaskStatus.PENDING, TaskStatus.QUEUED, TaskStatus.RUNNING]
                        ),
                    )
                )
            ).all()
        )
        for sibling in unfinished:
            if sibling.id != task.id:
                sibling.status = TaskStatus.CANCELLED
                sibling.finished_at = utcnow()
        await emit(
            session,
            job.project_id,
            "production.task.failed",
            job_id=job.id,
            run_id=run.id,
            data={"task_id": task.id, "kind": task.kind, **failure},
        )
        await emit(
            session,
            job.project_id,
            "run.failed",
            job_id=job.id,
            run_id=run.id,
            data=failure,
        )
        await session.commit()
        return {"status": "failed", "failure": failure}


async def execute_task(_ctx: dict | None, task_id: str, expected_attempt: int) -> dict:
    """Execute one graph node; an attempt token makes old deliveries harmless."""
    claimed = await _claim_task(task_id, expected_attempt)
    if isinstance(claimed, dict):
        return claimed
    kind, run_id = claimed
    try:
        if kind == SCENE_TASK:
            output = await _run_scene_task(task_id, run_id)
            return await _complete_scene_task(task_id, expected_attempt, output)
        if kind == ASSEMBLY_TASK:
            return await _run_assembly_task(task_id, run_id, expected_attempt)
        raise ValueError(f"unknown production task kind {kind!r}")
    except Exception:
        # The retry/degrade paths swallow the exception — without this line a
        # build of nine placeholders leaves no trace of WHY (it happened).
        logger.exception("task %s attempt %s failed", task_id, expected_attempt)
        result = await _fail_task(task_id, expected_attempt)
        if result["status"] == "failed":
            raise
        return result


async def cancel_run_graph(session: AsyncSession, job: Job, run: Run) -> None:
    """Cancel the active attempt and every unfinished graph node in one transaction."""
    now = utcnow()
    unfinished = list(
        (
            await session.scalars(
                select(ProductionTask).where(
                    ProductionTask.run_id == run.id,
                    ProductionTask.status.in_(
                        [TaskStatus.PENDING, TaskStatus.QUEUED, TaskStatus.RUNNING]
                    ),
                )
            )
        ).all()
    )
    for task in unfinished:
        task.status = TaskStatus.CANCELLED
        task.finished_at = now
    run.status = ExecutionStatus.CANCELLED
    run.finished_at = now
    run.failure = None
    job.status = ExecutionStatus.CANCELLED
    job.finished_at = now
    job.failure = None
    project = await session.get(Project, job.project_id)
    assert project is not None
    project.status = ProjectStatus.READY
    await emit(
        session,
        job.project_id,
        "run.cancelled",
        job_id=job.id,
        run_id=run.id,
        data={
            "message": "Production cancelled",
            "cancelled_task_count": len(unfinished),
        },
    )


def task_projection(task: ProductionTask) -> dict:
    return {
        "task_id": task.id,
        "kind": task.kind,
        "stable_key": task.stable_key,
        "status": task.status,
        "priority": task.priority,
        "attempt": task.attempt,
        "max_attempts": task.max_attempts,
        "input": task.input,
        "failure": task.failure,
        "started_at": task.started_at,
        "finished_at": task.finished_at,
        "accepted_at": task.accepted_at,
    }
