from dataclasses import dataclass

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
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
from ..execution.pipeline import CHAIN_ACTOR
from ..models import (
    ApprovalDecision,
    Artifact,
    ArtifactDependency,
    ArtifactType,
    ArtifactVersion,
    Evaluation,
)
from ..problems import AppProblem
from ..projects.router import project_or_404
from ..schemas import ApproveVersion, EditArtifact, ProductionBrief, Script

router = APIRouter(prefix="/projects/{project_id}", tags=["artifacts"])


@dataclass(frozen=True)
class Editable:
    model: type[BaseModel]
    label: str


# Which artifacts a creator may replace by hand, and what shape a replacement
# has to be.
#
# Absence is the answer for everything else, and it is deliberate rather than
# unfinished. A Teaching Plan is edited by reordering beats, which resets the
# script written against them — that is a command with consequences, not a
# payload swap. Scene visuals are generated code that has to pass the
# Visualizer's static checks before anything can load it.
EDITABLE: dict[ArtifactType, Editable] = {
    ArtifactType.PRODUCTION_BRIEF: Editable(ProductionBrief, "Production Brief"),
    # Narration is editable in exactly one place, and this is the endpoint
    # behind it. A new version moves `latest` while `approved` stays put, so an
    # edited script correctly reads as awaiting review again.
    ArtifactType.SCRIPT: Editable(Script, "Script"),
}


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


async def approval_projection(session: AsyncSession, artifact: Artifact) -> dict | None:
    """Who approved the current version, and whether anyone actually clicked.

    A chained run approves on the creator's behalf so the next stage can read the
    approved pointer. Without this, the studio would show a brief as "approved"
    to someone who never saw it — the pointer would be true and the story a lie.
    """
    if not artifact.approved_version_id:
        return None
    row = await session.scalar(
        select(ApprovalDecision)
        .where(ApprovalDecision.version_id == artifact.approved_version_id)
        .order_by(desc(ApprovalDecision.created_at))
        .limit(1)
    )
    if not row:
        return None
    return {
        "version_id": row.version_id,
        "actor_id": row.actor_id,
        "automatic": row.actor_id == CHAIN_ACTOR,
        "note": row.note,
        "created_at": row.created_at,
    }


@router.get("/production-brief")
async def production_brief(project_id: str, session: AsyncSession = Depends(get_session)):
    await project_or_404(session, project_id)
    artifact = await session.scalar(
        select(Artifact).where(
            Artifact.project_id == project_id,
            Artifact.artifact_type == ArtifactType.PRODUCTION_BRIEF,
        )
    )
    if not artifact or not artifact.latest_version_id:
        raise AppProblem(404, "artifact_not_found", "Production Brief not found.")
    version = await session.get(ArtifactVersion, artifact.latest_version_id)
    assert version is not None
    return {
        "artifact_id": artifact.id,
        "latest_version_id": artifact.latest_version_id,
        "approved_version_id": artifact.approved_version_id,
        "latest_is_approved": artifact.latest_version_id == artifact.approved_version_id,
        "latest_version": version_projection(artifact, version),
        "latest_evaluation": await evaluation_projection(session, version.id),
        "approval": await approval_projection(session, artifact),
    }


@router.post("/artifacts/{artifact_id}/versions", status_code=201)
async def edit_artifact(
    project_id: str,
    artifact_id: str,
    command: EditArtifact,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    artifact = await artifact_or_404(session, project_id, artifact_id)
    editable = EDITABLE.get(ArtifactType(artifact.artifact_type))
    if editable is None:
        raise AppProblem(
            400,
            "invalid_command",
            f"A {artifact.artifact_type.replace('_', ' ')} cannot be edited directly.",
        )
    # Validated against the artifact's own schema, chosen by what the artifact
    # actually is rather than by asking the caller. A payload that does not fit
    # is refused here, before anything immutable is written.
    try:
        payload = editable.model.model_validate(command.payload)
    except ValidationError as exc:
        raise AppProblem(
            422,
            "validation_failed",
            f"That is not a valid {editable.label}.",
            field_errors=exc.errors(include_url=False),
        ) from exc
    actor, scope, raw = actor_id(), f"edit_artifact:{artifact_id}", command.model_dump(mode="json")
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])
    locked_artifact = await lock_artifact(session, artifact_id, project_id=project_id)
    assert locked_artifact is not None
    artifact = locked_artifact
    if artifact.latest_version_id != command.base_version_id:
        raise AppProblem(
            409,
            "artifact_version_conflict",
            f"The {editable.label} has a newer version.",
            current_latest_version_id=artifact.latest_version_id,
        )
    version = await publish_version(
        session,
        artifact,
        payload=payload.model_dump(mode="json"),
        schema_version=command.schema_version,
        owner_role="user",
        created_by=actor,
        supersedes=command.base_version_id,
        rationale=f"Complete {editable.label} replacement saved by user.",
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
    page = rows[:limit]
    evaluations = list(
        (
            await session.scalars(
                select(Evaluation)
                .where(Evaluation.artifact_version_id.in_([version.id for version in page]))
                .order_by(Evaluation.created_at)
            )
        ).all()
    )
    evaluation_by_version = {
        row.artifact_version_id: {
            "evaluation_id": row.id,
            "artifact_version_id": row.artifact_version_id,
            "evaluator": row.evaluator,
            "decision": row.decision,
            "checks": row.checks,
            "summary": row.summary,
            "created_at": row.created_at,
        }
        for row in evaluations
    }
    return {
        "artifact_id": artifact.id,
        "latest_version_id": artifact.latest_version_id,
        "approved_version_id": artifact.approved_version_id,
        "items": [
            {
                **version_projection(artifact, v),
                "is_latest": v.id == artifact.latest_version_id,
                "is_approved": v.id == artifact.approved_version_id,
                "latest_evaluation": evaluation_by_version.get(v.id),
            }
            for v in page
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
