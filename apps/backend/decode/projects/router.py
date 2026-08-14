import hashlib
import logging
import mimetypes
from datetime import UTC, timedelta
from pathlib import PurePath

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..api import actor_id, idempotency_key, upload_chunks
from ..config import get_settings
from ..db import SessionLocal, get_session, new_id, utcnow
from ..domain import (
    canonical_hash,
    idempotent_replay,
    lock_command,
    publish_version,
    save_idempotency,
)
from ..models import (
    Artifact,
    ArtifactType,
    ExecutionStatus,
    Job,
    Project,
    Source,
    SourceStatus,
)
from ..problems import AppProblem
from ..providers.storage import object_store
from ..schemas import CreateProject, ProductionIntent, UpdateProject

router = APIRouter(prefix="/projects", tags=["projects"])
logger = logging.getLogger(__name__)


async def cleanup_staged(store, key: str) -> None:
    try:
        await store.delete(key)
    except Exception:
        logger.exception("failed to clean staged source object", extra={"object_key": key})


async def consume_upload(file: UploadFile, max_bytes: int) -> tuple[int, str]:
    size, digest = 0, hashlib.sha256()
    async for chunk in upload_chunks(file):
        size += len(chunk)
        if size > max_bytes:
            raise AppProblem(413, "source_too_large", "Source exceeds the configured upload limit.")
        digest.update(chunk)
    return size, digest.hexdigest()


async def mark_upload_failed(source_id: str, upload_lease_id: str, failure: dict) -> None:
    async with SessionLocal() as failure_session:
        source = await failure_session.get(Source, source_id)
        if (
            source
            and source.status == SourceStatus.UPLOADING
            and source.upload_lease_id == upload_lease_id
        ):
            source.status = SourceStatus.FAILED
            source.failure = failure
            source.updated_at = utcnow()
            await failure_session.commit()


def current_stage(
    job: Job | None,
    brief: object | None,
    plan: object | None = None,
    script: object | None = None,
    visuals: object | None = None,
) -> str:
    """Which stage the creator is looking at.

    Derived from the job and which artifacts exist rather than stored, so it
    cannot drift from them. The dashboard and the studio snapshot must agree.

    Read furthest-first: the newest artifact is the one the creator is working
    on, and a project with a script also has a plan and a brief.
    """
    if job and job.status in {
        ExecutionStatus.QUEUED,
        ExecutionStatus.RUNNING,
        ExecutionStatus.FAILED,
    }:
        return "processing"
    if visuals:
        return "edit"
    if script:
        return "script"
    if plan:
        return "teaching_plan"
    return "understanding" if brief else "draft"


async def project_or_404(session: AsyncSession, project_id: str) -> Project:
    project = await session.get(Project, project_id)
    # A deleted project is gone as far as every route is concerned. Guarding here
    # rather than in each caller means sources, briefs, jobs and the studio
    # snapshot all stop answering for it without touching any of them.
    if not project or project.deleted_at is not None:
        raise AppProblem(404, "project_not_found", "Project not found.")
    return project


@router.post("", status_code=201)
async def create_project(
    command: CreateProject,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    actor, scope, raw = actor_id(), "create_project", command.model_dump(mode="json")
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])
    project = Project(
        title=(command.title or "Untitled Decode").strip() or "Untitled Decode",
        auto_continue=command.auto_continue,
    )
    session.add(project)
    await session.flush()
    body = {
        "project_id": project.id,
        "title": project.title,
        "status": project.status,
        "auto_continue": project.auto_continue,
        "created_at": project.created_at.isoformat(),
    }
    save_idempotency(session, actor, scope, key, raw, 201, body)
    await session.commit()
    return body


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    command: UpdateProject,
    session: AsyncSession = Depends(get_session),
):
    """Turn running the stages back to back on or off.

    No idempotency key: this sets a value rather than starting work, so a replay
    of the same request is the same state and costs nothing.
    """
    project = await project_or_404(session, project_id)
    project.auto_continue = command.auto_continue
    project.updated_at = utcnow()
    await session.commit()
    return {"project_id": project.id, "auto_continue": project.auto_continue}


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    """Remove a project from the studio.

    Soft, because artifact_versions rejects DELETE by trigger — versions are kept
    in history, so a cascade would abort the transaction rather than tidy up.
    Source objects stay in the store too; reclaiming them is a sweep against
    deleted projects, not part of the creator's action.
    """
    actor, scope, raw = actor_id(), "delete_project", {"project_id": project_id}
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])
    project = await project_or_404(session, project_id)
    project.deleted_at = utcnow()
    body = {"project_id": project.id, "deleted_at": project.deleted_at.isoformat()}
    save_idempotency(session, actor, scope, key, raw, 200, body)
    await session.commit()
    return body


@router.get("")
async def list_projects(
    limit: int = Query(20, ge=1, le=100),
    cursor: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(Project)
        .where(Project.deleted_at.is_(None))
        .order_by(desc(Project.id))
        .limit(limit + 1)
    )
    if cursor:
        stmt = stmt.where(Project.id < cursor)
    rows = list((await session.scalars(stmt)).all())
    items = []
    for project in rows[:limit]:
        source_count = await session.scalar(
            select(func.count(Source.id)).where(
                Source.project_id == project.id, Source.status == SourceStatus.READY
            )
        )
        recent_job = await session.scalar(
            select(Job).where(Job.project_id == project.id).order_by(desc(Job.created_at)).limit(1)
        )
        brief = await session.scalar(
            select(Artifact.id).where(
                Artifact.project_id == project.id,
                Artifact.artifact_type == ArtifactType.PRODUCTION_BRIEF,
            )
        )
        plan = await session.scalar(
            select(Artifact.id).where(
                Artifact.project_id == project.id,
                Artifact.artifact_type == ArtifactType.TEACHING_PLAN,
            )
        )
        script = await session.scalar(
            select(Artifact.id).where(
                Artifact.project_id == project.id,
                Artifact.artifact_type == ArtifactType.SCRIPT,
            )
        )
        items.append(
            {
                "project_id": project.id,
                "title": project.title,
                "status": project.status,
                "current_stage": current_stage(recent_job, brief, plan, script),
                "source_count": source_count,
                "active_job_id": recent_job.id
                if recent_job
                and recent_job.status in {ExecutionStatus.QUEUED, ExecutionStatus.RUNNING}
                else None,
                "most_recent_job_id": recent_job.id if recent_job else None,
                "created_at": project.created_at,
                "updated_at": project.updated_at,
            }
        )
    return {
        "items": items,
        "next_cursor": rows[limit - 1].id if len(rows) > limit else None,
    }


@router.post("/{project_id}/sources", status_code=201)
async def attach_source(
    project_id: str,
    file: UploadFile = File(...),
    source_kind: str = Form(...),
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    await project_or_404(session, project_id)
    supported = {"document", "text", "transcript", "reference"}
    if source_kind not in supported:
        raise AppProblem(
            415,
            "unsupported_source_type",
            f"Supported source kinds: {', '.join(sorted(supported))}.",
        )
    filename = PurePath(file.filename or "source").name
    media_type = (
        file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    )
    actor, scope = actor_id(), f"attach_source:{project_id}"
    raw = {"filename": filename, "source_kind": source_kind, "media_type": media_type}
    command_identity = canonical_hash({"actor": actor, "scope": scope, "key": key})
    store = object_store(get_settings())
    await lock_command(session, actor, scope, key)
    staging = await session.scalar(
        select(Source)
        .where(Source.project_id == project_id, Source.command_identity == command_identity)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    metadata_hash = canonical_hash(raw)
    if staging and staging.request_metadata_hash != metadata_hash:
        raise AppProblem(
            409,
            "idempotency_conflict",
            "The idempotency key was already used with different source metadata.",
        )
    if staging and staging.status == SourceStatus.READY:
        await session.commit()
        _size, byte_hash = await consume_upload(file, get_settings().max_source_bytes)
        raw["byte_hash"] = byte_hash
        replay = await idempotent_replay(session, actor, scope, key, raw)
        if replay:
            return JSONResponse(replay["body"], replay["status_code"])
        raise AppProblem(409, "idempotency_conflict", "Completed upload has no command receipt.")
    if staging and staging.status == SourceStatus.UPLOADING:
        updated_at = staging.updated_at
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=UTC)
        stale = utcnow() - updated_at >= timedelta(seconds=get_settings().upload_stale_seconds)
        if not stale:
            raise AppProblem(
                409,
                "upload_in_progress",
                "A source upload for this command is already in progress.",
                retryable=True,
            )
    upload_lease_id = new_id()
    if staging:
        source_id, previous_object_key = staging.id, staging.object_key
        object_key = (
            f"projects/{project_id}/sources/{source_id}/attempts/{upload_lease_id}/{filename}"
        )
        staging.status = SourceStatus.UPLOADING
        staging.object_key = object_key
        staging.upload_lease_id = upload_lease_id
        staging.failure = None
        staging.updated_at = utcnow()
        await session.commit()
        await cleanup_staged(store, previous_object_key)
    else:
        source_id = new_id()
        object_key = (
            f"projects/{project_id}/sources/{source_id}/attempts/{upload_lease_id}/{filename}"
        )
        staging = Source(
            id=source_id,
            project_id=project_id,
            artifact_id=None,
            version_id=None,
            filename=filename,
            source_kind=source_kind,
            media_type=media_type,
            size_bytes=None,
            status=SourceStatus.UPLOADING,
            object_key=object_key,
            upload_lease_id=upload_lease_id,
            command_identity=command_identity,
            request_metadata_hash=metadata_hash,
            updated_at=utcnow(),
        )
        session.add(staging)
        await session.commit()
    try:
        size, stored_key, byte_hash = await store.put(
            object_key, upload_chunks(file), get_settings().max_source_bytes
        )
    except OverflowError as exc:
        failure = {"code": "source_too_large", "message": "Source exceeds upload limit."}
        await mark_upload_failed(source_id, upload_lease_id, failure)
        await cleanup_staged(store, object_key)
        raise AppProblem(413, "source_too_large", failure["message"]) from exc
    except Exception as exc:
        failure = {"code": "object_store_unavailable", "message": "Upload failed."}
        await mark_upload_failed(source_id, upload_lease_id, failure)
        await cleanup_staged(store, object_key)
        raise AppProblem(
            503,
            "object_store_unavailable",
            "Object storage is temporarily unavailable.",
            retryable=True,
        ) from exc
    raw["byte_hash"] = byte_hash
    try:
        staging = await session.scalar(
            select(Source)
            .where(Source.id == source_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        assert staging is not None
        if (
            staging.status != SourceStatus.UPLOADING
            or staging.upload_lease_id != upload_lease_id
            or staging.object_key != stored_key
        ):
            raise AppProblem(409, "upload_in_progress", "Upload ownership changed.", retryable=True)
        artifact = Artifact(
            project_id=project_id, artifact_type=ArtifactType.SOURCE, stable_key=source_id
        )
        session.add(artifact)
        await session.flush()
        manifest = {
            "object_key": stored_key,
            "filename": filename,
            "media_type": media_type,
            "size_bytes": size,
            "sha256": byte_hash,
        }
        version = await publish_version(
            session,
            artifact,
            blob_manifest=manifest,
            owner_role="user",
            created_by=actor,
            rationale="Source uploaded by user.",
        )
        staging.artifact_id = artifact.id
        staging.version_id = version.id
        staging.size_bytes = size
        staging.byte_hash = byte_hash
        staging.status = SourceStatus.READY
        staging.failure = None
        staging.updated_at = utcnow()
        body = {
            "source_id": source_id,
            "artifact_id": artifact.id,
            "source_version_id": version.id,
            "filename": filename,
            "source_kind": source_kind,
            "size_bytes": size,
            "status": SourceStatus.READY,
        }
        save_idempotency(session, actor, scope, key, raw, 201, body)
        await session.commit()
        return body
    except Exception:
        await session.rollback()
        await cleanup_staged(store, stored_key)
        await mark_upload_failed(
            source_id,
            upload_lease_id,
            {"code": "source_finalize_failed", "message": "Upload finalization failed."},
        )
        raise


@router.post("/{project_id}/production-intent/versions", status_code=201)
async def publish_intent(
    project_id: str,
    command: ProductionIntent,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    await project_or_404(session, project_id)
    actor, scope, raw = actor_id(), f"publish_intent:{project_id}", command.model_dump(mode="json")
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])
    locked_project = await session.scalar(
        select(Project)
        .where(Project.id == project_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    assert locked_project is not None
    artifact = await session.scalar(
        select(Artifact).where(
            Artifact.project_id == project_id,
            Artifact.artifact_type == ArtifactType.PRODUCTION_INTENT,
        )
    )
    if not artifact:
        artifact = Artifact(
            project_id=project_id,
            artifact_type=ArtifactType.PRODUCTION_INTENT,
            stable_key="default",
        )
        session.add(artifact)
        await session.flush()
    version = await publish_version(
        session,
        artifact,
        payload=raw,
        owner_role="user",
        created_by=actor,
        supersedes_latest=True,
        rationale="Production intent published by user.",
    )
    body = {
        "artifact_id": artifact.id,
        "version_id": version.id,
        "sequence": version.sequence,
        "artifact_type": artifact.artifact_type,
        "schema_version": version.schema_version,
        "payload": version.payload,
        "blob_manifest": version.blob_manifest,
        "content_hash": version.content_hash,
        "owner_role": version.owner_role,
        "created_by": version.created_by,
        "created_at": version.created_at.isoformat(),
        "run_id": version.run_id,
        "supersedes_version_id": version.supersedes_version_id,
        "rationale": version.rationale,
    }
    save_idempotency(session, actor, scope, key, raw, 201, body)
    await session.commit()
    return body


@router.get("/{project_id}/studio")
async def studio(project_id: str, session: AsyncSession = Depends(get_session)):
    project = await project_or_404(session, project_id)
    sources = list(
        (await session.scalars(select(Source).where(Source.project_id == project_id))).all()
    )
    ready_sources = [source for source in sources if source.status == SourceStatus.READY]
    artifacts = list(
        (await session.scalars(select(Artifact).where(Artifact.project_id == project_id))).all()
    )
    job = await session.scalar(
        select(Job).where(Job.project_id == project_id).order_by(desc(Job.created_at)).limit(1)
    )
    by_type = {a.artifact_type: a for a in artifacts}
    brief = by_type.get(ArtifactType.PRODUCTION_BRIEF)
    plan = by_type.get(ArtifactType.TEACHING_PLAN)
    script = by_type.get(ArtifactType.SCRIPT)
    visuals = by_type.get(ArtifactType.SCENE_VISUALS)
    intent = by_type.get(ArtifactType.PRODUCTION_INTENT)
    job_summary = (
        {
            "job_id": job.id,
            "kind": job.kind,
            "status": job.status,
            "active_run_id": job.active_run_id,
        }
        if job
        else None
    )
    return {
        "project": {
            "project_id": project.id,
            "title": project.title,
            "status": project.status,
            "auto_continue": project.auto_continue,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
        },
        "sources": [
            {
                "source_id": s.id,
                "filename": s.filename,
                "version_id": s.version_id,
                "size_bytes": s.size_bytes,
                "status": s.status,
            }
            for s in sources
        ],
        "current_stage": current_stage(job, brief, plan, script, visuals),
        "active_job": job_summary
        if job and job.status in {ExecutionStatus.QUEUED, ExecutionStatus.RUNNING}
        else None,
        "most_recent_job": job_summary,
        "artifacts": [
            {
                "artifact_type": k,
                "artifact_id": a.id,
                "latest_version_id": a.latest_version_id,
                "approved_version_id": a.approved_version_id,
            }
            for k, a in by_type.items()
        ],
        "allowed_actions": {
            "can_generate_brief": bool(ready_sources and intent),
            "can_edit_brief": bool(brief),
            "can_approve_brief": bool(brief),
            "can_generate_plan": bool(brief and brief.approved_version_id),
            "can_approve_plan": bool(plan),
            "can_retry_job": bool(job and job.status == ExecutionStatus.FAILED),
        },
    }
