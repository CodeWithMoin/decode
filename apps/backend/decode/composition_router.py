"""Resolve + stamp a scene's HyperFrames composition for playback.

The stored composition is duration-agnostic (VISUALIZER-TO-HYPERFRAMES §3): it
carries the `{{SCENE_DURATION}}` token and a `decode:timing` marker. This endpoint
resolves the scene's anchored beats against the current narration and stamps the
measured length and the resolved `{beat, start, duration}` metadata in, returning
HTML the frontend renders as-is.

Resolution stays server-side so `timing.py` is the single resolver — the frontend
never re-implements anchor→seconds. Read-only: it computes from current artifacts
and mutates nothing.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .agents.renderer.composition import resolve_scene, stamp
from .db import get_session
from .models import Artifact, ArtifactType, ArtifactVersion
from .projects.router import project_or_404
from .schemas import SceneVisuals, Voice

router = APIRouter(prefix="/projects/{project_id}", tags=["composition"])


async def _payload(
    session: AsyncSession, project_id: str, artifact_type: ArtifactType
) -> dict | None:
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


@router.get("/scene-visuals/{beat_id}/composition")
async def scene_composition(
    project_id: str,
    beat_id: str,
    session: AsyncSession = Depends(get_session),
):
    await project_or_404(session, project_id)

    visuals_payload = await _payload(session, project_id, ArtifactType.SCENE_VISUALS)
    if visuals_payload is None:
        raise HTTPException(status_code=404, detail="no scene visuals yet")
    visuals = SceneVisuals.model_validate(visuals_payload)
    scene = next((s for s in visuals.scenes if s.beat_id == beat_id), None)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"no scene for beat {beat_id!r}")
    if not scene.composition_html:
        # A legacy React scene has no HyperFrames composition to stamp.
        raise HTTPException(status_code=409, detail="scene is not a HyperFrames composition")

    # Narration is the timing authority (ADR-005): its clip gives both the scene's
    # length and the words phrase anchors resolve against. Without it there is no
    # duration to stamp, so the composition is not ready to play yet.
    voice_payload = await _payload(session, project_id, ArtifactType.VOICE)
    clip = None
    if voice_payload is not None:
        voice = Voice.model_validate(voice_payload)
        clip = next((c for c in voice.clips if c.beat_id == beat_id), None)
    if clip is None:
        raise HTTPException(status_code=409, detail="narration for this scene is not ready")

    narration = clip.narration_timing()
    resolved = resolve_scene(scene.beats, narration)
    html = stamp(scene.composition_html, narration.duration, resolved.metadata)
    return {
        "html": html,
        "duration": narration.duration,
        "beats": [m.model_dump() for m in resolved.metadata],
        "unresolved": [u.model_dump() for u in resolved.unresolved],
    }
