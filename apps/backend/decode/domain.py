import hashlib
import json
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import new_id
from .models import Artifact, ArtifactDependency, ArtifactVersion, IdempotencyRecord, ProjectEvent
from .problems import AppProblem


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(encoded).hexdigest()


async def lock_artifact(
    session: AsyncSession, artifact_id: str, *, project_id: str | None = None
) -> Artifact | None:
    """Lock and refresh an artifact so optimistic checks see the post-wait row."""
    statement = select(Artifact).where(Artifact.id == artifact_id)
    if project_id is not None:
        statement = statement.where(Artifact.project_id == project_id)
    return await session.scalar(
        statement.with_for_update().execution_options(populate_existing=True)
    )


async def publish_version(
    session: AsyncSession,
    artifact: Artifact,
    *,
    payload: dict | None = None,
    blob_manifest: dict | None = None,
    schema_version: int = 1,
    owner_role: str,
    created_by: str,
    run_id: str | None = None,
    supersedes: str | None = None,
    supersedes_latest: bool = False,
    rationale: str | None = None,
    parents: list[tuple[str, str]] | None = None,
) -> ArtifactVersion:
    locked_artifact = await lock_artifact(session, artifact.id)
    if locked_artifact is not None:
        artifact = locked_artifact
    if supersedes_latest:
        supersedes = artifact.latest_version_id
    value = payload if payload is not None else blob_manifest
    digest = canonical_hash(value)
    sequence = (
        await session.scalar(
            select(func.max(ArtifactVersion.sequence)).where(
                ArtifactVersion.artifact_id == artifact.id
            )
        )
        or 0
    ) + 1
    version = ArtifactVersion(
        id=new_id(),
        artifact_id=artifact.id,
        sequence=sequence,
        schema_version=schema_version,
        payload=payload,
        blob_manifest=blob_manifest,
        content_hash=digest,
        owner_role=owner_role,
        created_by=created_by,
        run_id=run_id,
        supersedes_version_id=supersedes,
        rationale=rationale,
    )
    session.add(version)
    await session.flush()
    for parent_id, role in parents or []:
        session.add(
            ArtifactDependency(child_version_id=version.id, parent_version_id=parent_id, role=role)
        )
    artifact.latest_version_id = version.id
    return version


async def emit(
    session: AsyncSession,
    project_id: str,
    event_type: str,
    *,
    job_id: str | None = None,
    run_id: str | None = None,
    artifact_id: str | None = None,
    version_id: str | None = None,
    data: dict | None = None,
) -> ProjectEvent:
    event = ProjectEvent(
        project_id=project_id,
        type=event_type,
        job_id=job_id,
        run_id=run_id,
        artifact_id=artifact_id,
        artifact_version_id=version_id,
        data=data or {},
    )
    session.add(event)
    await session.flush()
    return event


async def idempotent_replay(
    session: AsyncSession, actor: str, scope: str, key: str, request: Any
) -> dict | None:
    await lock_command(session, actor, scope, key)
    request_hash = canonical_hash(request)
    record = await session.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.actor_id == actor,
            IdempotencyRecord.scope == scope,
            IdempotencyRecord.key == key,
        )
    )
    if not record:
        return None
    if record.request_hash != request_hash:
        raise AppProblem(
            409,
            "idempotency_conflict",
            "The idempotency key was already used with different input.",
        )
    return {"body": record.response, "status_code": record.status_code}


async def lock_command(session: AsyncSession, actor: str, scope: str, key: str) -> None:
    if session.get_bind().dialect.name == "postgresql":
        # One transaction at a time may resolve a given command identity.
        await session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:token))"),
            {"token": f"{actor}:{scope}:{key}"},
        )


def save_idempotency(
    session: AsyncSession,
    actor: str,
    scope: str,
    key: str,
    request: Any,
    status_code: int,
    response: dict,
) -> None:
    session.add(
        IdempotencyRecord(
            actor_id=actor,
            scope=scope,
            key=key,
            request_hash=canonical_hash(request),
            status_code=status_code,
            response=response,
        )
    )


def version_projection(artifact: Artifact, version: ArtifactVersion) -> dict:
    """One immutable version on the wire.

    Version-level fields only. The artifact's latest/approved pointers are
    mutable projections that belong to the artifact, not to any version, and
    callers that need them add them alongside.
    """
    return {
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
        "created_at": version.created_at,
        "run_id": version.run_id,
        "supersedes_version_id": version.supersedes_version_id,
        "rationale": version.rationale,
    }
