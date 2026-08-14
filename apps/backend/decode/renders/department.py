"""Renderer worker — spawns a Node.js subprocess to render Remotion output."""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

from ..config import get_settings

logger = logging.getLogger(__name__)


def _render_root() -> Path:
    root = Path(get_settings().render_output_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _status_path(render_id: str) -> Path:
    return _render_root() / f"{render_id}.status.json"


def write_status(render_id: str, status: str, error: str | None = None) -> None:
    payload = {"status": status}
    if error:
        payload["error"] = error
    _status_path(render_id).write_text(json.dumps(payload))


def read_status(render_id: str) -> dict:
    path = _status_path(render_id)
    if not path.exists():
        return {"status": "unknown"}
    return json.loads(path.read_text())


def render_sync(
    render_id: str,
    scenes: list[dict],
    visual_pick: dict[int, str],
) -> Path | None:
    """Render the full cut to an MP4 file via a Node.js subprocess.

    Writes a status file so the API can report progress. Never raises: the
    background task must survive a failure and record it, not kill the worker.
    """
    settings = get_settings()
    cwd = Path(settings.render_cwd)
    render_root = _render_root()
    props_path = render_root / f"{render_id}.json"
    output_path = render_root / f"{render_id}.mp4"

    props = {
        "scenes": scenes,
        "visualPick": visual_pick,
    }
    props_path.write_text(json.dumps(props))
    write_status(render_id, "running")

    logger.info(
        "render_start",
        extra={"render_id": render_id, "cwd": str(cwd), "output": str(output_path)},
    )

    try:
        result = subprocess.run(
            [
                settings.render_node_bin,
                "tsx",
                str(settings.render_script_path),
                str(props_path),
                str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=settings.render_timeout_seconds,
            cwd=str(cwd),
        )

        if result.returncode != 0:
            logger.error(
                "render_failed",
                extra={"render_id": render_id, "stderr": result.stderr[-2000:]},
            )
            write_status(render_id, "failed", result.stderr[-500:])
            return None

        write_status(render_id, "done")
        logger.info("render_complete", extra={"render_id": render_id, "output": str(output_path)})
        return output_path

    except subprocess.TimeoutExpired:
        logger.error("render_timeout", extra={"render_id": render_id})
        write_status(render_id, "failed", "Render timed out")
        return None
    finally:
        if props_path.exists():
            props_path.unlink()
