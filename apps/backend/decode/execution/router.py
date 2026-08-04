import asyncio
import json

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..api import actor_id, idempotency_key
from ..db import SessionLocal, get_session
from ..domain import canonical_hash, emit, idempotent_replay, save_idempotency
from ..models import (
    Artifact,
    ArtifactVersion,
    Job,
    JobInput,
    OutboxEvent,
    Project,
    ProjectEvent,
    Run,
    Source,
    UsageRecord,
)
from ..problems import AppProblem
from ..projects.router import project_or_404
from ..schemas import GenerateBrief, RetryRun

router = APIRouter(prefix="/projects/{project_id}", tags=["execution"])


async def job_or_404(session: AsyncSession, project_id: str, job_id: str) -> Job:
    job = await session.scalar(select(Job).where(Job.id == job_id, Job.project_id == project_id))
    if not job:
        raise AppProblem(404, "job_not_found", "Job not found.")
    return job


def job_projection(job: Job, run: Run | None, inputs: list[JobInput]) -> dict:
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
                    Source.status == "ready",
                    Source.version_id.in_(command.source_version_ids),
                )
            )
        ).all()
    )
    if ready_source_versions != set(command.source_version_ids):
        raise AppProblem(400, "invalid_command", "Every source input must be ready.")
    job = Job(project_id=project_id)
    session.add(job)
    await session.flush()
    manifest = {
        "source_version_ids": command.source_version_ids,
        "intent_version_id": command.intent_version_id,
        "schema": 1,
    }
    run = Run(
        job_id=job.id,
        attempt=1,
        context_manifest=manifest,
        context_hash=canonical_hash(manifest),
    )
    session.add(run)
    await session.flush()
    job.active_run_id = run.id
    for version_id in command.source_version_ids:
        session.add(JobInput(job_id=job.id, version_id=version_id, role="source"))
    session.add(
        JobInput(job_id=job.id, version_id=command.intent_version_id, role="production_intent")
    )
    session.add(OutboxEvent(topic="run.execute", aggregate_id=run.id, payload={"run_id": run.id}))
    project = await session.get(Project, project_id)
    assert project is not None
    project.status = "processing"
    await emit(
        session,
        project_id,
        "job.queued",
        job_id=job.id,
        run_id=run.id,
        data={"message": "Producer queued"},
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


@router.get("/jobs/{job_id}")
async def job_detail(project_id: str, job_id: str, session: AsyncSession = Depends(get_session)):
    job = await job_or_404(session, project_id, job_id)
    run = await session.get(Run, job.active_run_id) if job.active_run_id else None
    inputs = list((await session.scalars(select(JobInput).where(JobInput.job_id == job.id))).all())
    return job_projection(job, run, inputs)


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
    if not previous or previous.job_id != job.id or previous.status != "failed":
        raise AppProblem(
            409, "run_already_active", "The expected run is not the failed active run."
        )
    if job.active_run_id != previous.id or job.status != "failed":
        raise AppProblem(409, "run_already_active", "Another run is already active.")
    attempt = (
        await session.scalar(select(func.max(Run.attempt)).where(Run.job_id == job.id)) or 0
    ) + 1
    run = Run(
        job_id=job.id,
        attempt=attempt,
        context_manifest=previous.context_manifest,
        context_hash=previous.context_hash,
    )
    session.add(run)
    await session.flush()
    job.active_run_id = run.id
    job.status = "queued"
    job.failure = None
    job.finished_at = None
    job.result_artifact_version_id = None
    project = await session.get(Project, project_id)
    assert project is not None
    project.status = "processing"
    session.add(OutboxEvent(topic="run.execute", aggregate_id=run.id, payload={"run_id": run.id}))
    await emit(
        session,
        project_id,
        "job.queued",
        job_id=job.id,
        run_id=run.id,
        data={"message": "Producer retry queued"},
    )
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
                "estimated_cost_usd": str(r.estimated_cost_usd),
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
