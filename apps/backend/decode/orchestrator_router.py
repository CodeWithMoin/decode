"""The orchestrator endpoint — the side chat's one turn.

`POST /projects/{id}/orchestrator/turn` takes a natural-language message and the
project's current scenes and returns a reply and, when the request maps to a tool,
a scoped proposal. It is **read-only**: proposing changes nothing, so there is no
idempotency key and no mutation here. The proposal's tool runs only when the
creator clicks Apply, through that tool's own endpoint (e.g.
`/scene-visuals/regenerations`), which posts the receipt. See `orchestrator.py`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_session
from .models import Artifact, ArtifactType, ArtifactVersion
from .orchestrator import SceneRef, build_orchestrator
from .projects.router import project_or_404
from .schemas import Script, TeachingPlan

router = APIRouter(prefix="/projects/{project_id}", tags=["orchestrator"])


class OrchestratorMessage(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


async def _approved_or_latest_payload(
    session: AsyncSession, project_id: str, artifact_type: ArtifactType
) -> dict | None:
    """The payload of an artifact's approved version, or its latest if none is
    approved yet — the same 'current cut' the workspace reads."""
    artifact = await session.scalar(
        select(Artifact).where(
            Artifact.project_id == project_id, Artifact.artifact_type == artifact_type
        )
    )
    if artifact is None:
        return None
    version_id = artifact.approved_version_id or artifact.latest_version_id
    if version_id is None:
        return None
    version = await session.get(ArtifactVersion, version_id)
    return version.payload if version else None


async def _current_scenes(session: AsyncSession, project_id: str) -> list[SceneRef]:
    """Build the scene list the orchestrator reasons over from plan + script.

    The plan owns each beat's identity and order (the number the creator says);
    the script owns its narration. A beat with no id is not a scene — the same
    guard the workspace uses.
    """
    plan_payload = await _approved_or_latest_payload(
        session, project_id, ArtifactType.TEACHING_PLAN
    )
    if plan_payload is None:
        return []
    plan = TeachingPlan.model_validate(plan_payload)

    script_payload = await _approved_or_latest_payload(session, project_id, ArtifactType.SCRIPT)
    narration = {}
    if script_payload is not None:
        narration = {b.beat_id: b.narration for b in Script.model_validate(script_payload).beats}

    scenes: list[SceneRef] = []
    for beat in plan.beats:
        if not beat.id:
            continue
        scenes.append(
            SceneRef(
                beat_id=beat.id,
                index=len(scenes) + 1,
                title=beat.title or "",
                narration=narration.get(beat.id, ""),
            )
        )
    return scenes


@router.post("/orchestrator/turn")
async def orchestrator_turn(
    project_id: str,
    command: OrchestratorMessage,
    session: AsyncSession = Depends(get_session),
):
    await project_or_404(session, project_id)
    scenes = await _current_scenes(session, project_id)
    turn = await build_orchestrator().turn(command.message, scenes)
    return turn.model_dump()
