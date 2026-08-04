from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..api import actor_id, idempotency_key
from ..db import get_session
from ..domain import (
    idempotent_replay,
    lock_artifact,
    publish_version,
    save_idempotency,
    version_projection,
)
from ..models import ApprovalDecision, Artifact, ArtifactDependency, ArtifactVersion, Evaluation
from ..problems import AppProblem
from ..projects.router import project_or_404
from ..schemas import ApproveVersion, EditBrief

router = APIRouter(prefix="/projects/{project_id}", tags=["artifacts"])


async def artifact_or_404(session: AsyncSession, project_id: str, artifact_id: str) -> Artifact:
    artifact = await session.scalar(
        select(Artifact).where(Artifact.id == artifact_id, Artifact.project_id == project_id)
    )
    if not artifact:
        raise AppProblem(404, "artifact_not_found", "Artifact not found.")
    return artifact


async def evaluation_projection(session: AsyncSession, version_id: str) -> dict | None:
    row = await session.scalar(
        select(Evaluation)
        .where(Evaluation.artifact_version_id == version_id)
        .order_by(desc(Evaluation.created_at))
        .limit(1)
    )
    return (
        None
        if not row
        else {
            "evaluation_id": row.id,
            "artifact_version_id": row.artifact_version_id,
            "evaluator": row.evaluator,
            "decision": row.decision,
            "checks": row.checks,
            "summary": row.summary,
            "created_at": row.created_at,
        }
    )


@router.get("/production-brief")
async def production_brief(project_id: str, session: AsyncSession = Depends(get_session)):
    await project_or_404(session, project_id)
    artifact = await session.scalar(
        select(Artifact).where(
            Artifact.project_id == project_id, Artifact.artifact_type == "production_brief"
        )
    )
    if not artifact or not artifact.latest_version_id:
        raise AppProblem(404, "artifact_not_found", "Production Brief not found.")
    version = await session.get(ArtifactVersion, artifact.latest_version_id)
    assert version is not None
    flat = version_projection(
        artifact, version, evaluation=await evaluation_projection(session, version.id)
    )
    latest_version = {
        key: value
        for key, value in flat.items()
        if key
        not in {
            "latest_version_id",
            "approved_version_id",
            "latest_is_approved",
            "latest_evaluation",
        }
    }
    return {
        "artifact_id": artifact.id,
        "latest_version_id": artifact.latest_version_id,
        "approved_version_id": artifact.approved_version_id,
        "latest_is_approved": artifact.latest_version_id == artifact.approved_version_id,
        "latest_version": latest_version,
        "latest_evaluation": flat["latest_evaluation"],
    }


@router.post("/artifacts/{artifact_id}/versions", status_code=201)
async def edit_brief(
    project_id: str,
    artifact_id: str,
    command: EditBrief,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    artifact = await artifact_or_404(session, project_id, artifact_id)
    if artifact.artifact_type != "production_brief":
        raise AppProblem(
            400, "invalid_command", "Only Production Brief editing is available in this milestone."
        )
    actor, scope, raw = actor_id(), f"edit_brief:{artifact_id}", command.model_dump(mode="json")
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])
    locked_artifact = await lock_artifact(session, artifact_id, project_id=project_id)
    assert locked_artifact is not None
    artifact = locked_artifact
    if artifact.latest_version_id != command.base_version_id:
        raise AppProblem(
            409,
            "artifact_version_conflict",
            "The Production Brief has a newer version.",
            current_latest_version_id=artifact.latest_version_id,
        )
    version = await publish_version(
        session,
        artifact,
        payload=command.payload.model_dump(mode="json"),
        schema_version=command.schema_version,
        owner_role="user",
        created_by=actor,
        supersedes=command.base_version_id,
        rationale="Complete Production Brief replacement saved by user.",
        parents=[(command.base_version_id, "supersedes")],
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
        "latest_version_id": artifact.latest_version_id,
        "approved_version_id": artifact.approved_version_id,
        "latest_is_approved": artifact.latest_version_id == artifact.approved_version_id,
    }
    save_idempotency(session, actor, scope, key, raw, 201, body)
    await session.commit()
    return body


@router.post("/artifacts/{artifact_id}/versions/{version_id}/approvals", status_code=201)
async def approve(
    project_id: str,
    artifact_id: str,
    version_id: str,
    command: ApproveVersion,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    artifact = await artifact_or_404(session, project_id, artifact_id)
    version = await session.scalar(
        select(ArtifactVersion).where(
            ArtifactVersion.id == version_id, ArtifactVersion.artifact_id == artifact.id
        )
    )
    if not version:
        raise AppProblem(404, "artifact_not_found", "Artifact version not found.")
    actor, scope, raw = (
        actor_id(),
        f"approve:{artifact_id}:{version_id}",
        command.model_dump(mode="json"),
    )
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])
    decision = ApprovalDecision(
        artifact_id=artifact.id,
        version_id=version.id,
        decision="approved",
        note=command.note,
        actor_id=actor,
    )
    session.add(decision)
    artifact.approved_version_id = version.id
    await session.flush()
    body = {
        "approval_id": decision.id,
        "artifact_id": artifact.id,
        "version_id": version.id,
        "decision": decision.decision,
        "note": decision.note,
        "actor_id": actor,
        "created_at": decision.created_at.isoformat(),
        "latest_version_id": artifact.latest_version_id,
        "approved_version_id": artifact.approved_version_id,
    }
    save_idempotency(session, actor, scope, key, raw, 201, body)
    await session.commit()
    return body


@router.get("/artifacts/{artifact_id}/versions")
async def history(
    project_id: str,
    artifact_id: str,
    limit: int = Query(20, ge=1, le=100),
    cursor: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    artifact = await artifact_or_404(session, project_id, artifact_id)
    stmt = (
        select(ArtifactVersion)
        .where(ArtifactVersion.artifact_id == artifact.id)
        .order_by(desc(ArtifactVersion.sequence))
        .limit(limit + 1)
    )
    if cursor is not None:
        try:
            cursor_sequence = int(cursor)
        except ValueError as exc:
            raise AppProblem(400, "invalid_command", "History cursor is invalid.") from exc
        stmt = stmt.where(ArtifactVersion.sequence < cursor_sequence)
    rows = list((await session.scalars(stmt)).all())
    return {
        "artifact_id": artifact.id,
        "latest_version_id": artifact.latest_version_id,
        "approved_version_id": artifact.approved_version_id,
        "items": [
            {
                "artifact_id": artifact.id,
                "version_id": v.id,
                "sequence": v.sequence,
                "schema_version": v.schema_version,
                "artifact_type": artifact.artifact_type,
                "payload": v.payload,
                "blob_manifest": v.blob_manifest,
                "content_hash": v.content_hash,
                "owner_role": v.owner_role,
                "created_by": v.created_by,
                "run_id": v.run_id,
                "supersedes_version_id": v.supersedes_version_id,
                "rationale": v.rationale,
                "created_at": v.created_at,
                "is_latest": v.id == artifact.latest_version_id,
                "is_approved": v.id == artifact.approved_version_id,
            }
            for v in rows[:limit]
        ],
        "next_cursor": str(rows[limit - 1].sequence) if len(rows) > limit else None,
    }


@router.get("/artifacts/{artifact_id}/versions/{version_id}/lineage")
async def lineage(
    project_id: str, artifact_id: str, version_id: str, session: AsyncSession = Depends(get_session)
):
    artifact = await artifact_or_404(session, project_id, artifact_id)
    version = await session.scalar(
        select(ArtifactVersion).where(
            ArtifactVersion.id == version_id, ArtifactVersion.artifact_id == artifact.id
        )
    )
    if not version:
        raise AppProblem(404, "artifact_not_found", "Artifact version not found.")
    deps = list(
        (
            await session.scalars(
                select(ArtifactDependency).where(
                    or_(
                        ArtifactDependency.child_version_id == version.id,
                        ArtifactDependency.parent_version_id == version.id,
                    )
                )
            )
        ).all()
    )
    related_ids = {d.parent_version_id for d in deps} | {d.child_version_id for d in deps}
    related_versions = {
        row.id: row
        for row in (
            await session.scalars(
                select(ArtifactVersion).where(ArtifactVersion.id.in_(related_ids))
            )
        ).all()
    }
    related_artifact_ids = {row.artifact_id for row in related_versions.values()}
    related_artifacts = {
        row.id: row
        for row in (
            await session.scalars(select(Artifact).where(Artifact.id.in_(related_artifact_ids)))
        ).all()
    }

    def summary(version_id: str, role: str) -> dict:
        related = related_versions[version_id]
        related_artifact = related_artifacts[related.artifact_id]
        return {
            "artifact_id": related_artifact.id,
            "artifact_type": related_artifact.artifact_type,
            "version_id": related.id,
            "sequence": related.sequence,
            "role": role,
            "created_at": related.created_at,
        }

    return {
        "artifact_id": artifact.id,
        "version_id": version.id,
        "parents": [
            summary(d.parent_version_id, d.role) for d in deps if d.child_version_id == version.id
        ],
        "children": [
            summary(d.child_version_id, d.role) for d in deps if d.parent_version_id == version.id
        ],
    }
