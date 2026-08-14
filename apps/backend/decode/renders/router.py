"""Render endpoint — start a video render and download its result."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..api import actor_id, idempotency_key
from ..config import get_settings
from ..db import get_session
from ..domain import idempotent_replay, save_idempotency
from ..problems import AppProblem
from ..projects.router import project_or_404
from . import department
from .schemas import RenderResponse, StartRender

router = APIRouter(tags=["renders"])


@router.post("/projects/{project_id}/renders", status_code=202)
async def start_render(
    project_id: str,
    command: StartRender,
    background_tasks: BackgroundTasks,
    key: str = Depends(idempotency_key),
    session: AsyncSession = Depends(get_session),
):
    """Queue the full cut for rendering to MP4. Returns immediately."""
    await project_or_404(session, project_id)

    actor, scope, raw = (
        actor_id(),
        f"render:{project_id}",
        command.model_dump(mode="json"),
    )
    if replay := await idempotent_replay(session, actor, scope, key, raw):
        return JSONResponse(replay["body"], replay["status_code"])

    render_id = uuid.uuid4().hex[:12]
    department.write_status(render_id, "queued")

    background_tasks.add_task(
        department.render_sync,
        render_id,
        command.scenes,
        command.visual_pick,
    )

    body = RenderResponse(render_id=render_id, status="queued").model_dump(mode="json")
    save_idempotency(session, actor, scope, key, raw, 202, body)
    await session.commit()

    return body


@router.get("/renders/{render_id}")
async def get_render(render_id: str):
    """Report render progress and, when done, the download path."""
    status = department.read_status(render_id)
    download_path = None
    if status.get("status") == "done":
        download_path = f"/api/v1/renders/{render_id}/download"
    return {
        "render_id": render_id,
        "status": status.get("status"),
        "error": status.get("error"),
        "download_path": download_path,
    }


@router.get("/renders/{render_id}/download")
async def download_render(render_id: str):
    """Download a completed render."""
    settings = get_settings()
    output = Path(settings.render_output_dir) / f"{render_id}.mp4"
    if not output.exists():
        raise AppProblem(404, "render_not_found", "That render was not found or has expired.")
    return FileResponse(
        output,
        media_type="video/mp4",
        filename=f"decode-{render_id}.mp4",
    )
