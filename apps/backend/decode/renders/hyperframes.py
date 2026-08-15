"""HyperFrames export — render the cut with `hyperframes render`, not Remotion.

Decode's scenes are discrete (no cross-scene transitions), so the cut renders
per scene and stitches: each scene's stamped composition renders to a silent
clip via `hyperframes render`, its narration is muxed on with ffmpeg, and the
clips concatenate in order. This sidesteps sub-composition id-namespacing that a
single assembled project would need, and each scene stays an isolated,
deterministic composition (VISUALIZER-TO-HYPERFRAMES slice 4).

The pure helpers (project scaffold, ffmpeg arg builders) are unit-tested; the
subprocess work needs the HyperFrames CLI (chromium) and ffmpeg at runtime.
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents.visualizer.composition import resolve_scene, stamp
from ..config import Settings
from ..models import Artifact, ArtifactType, ArtifactVersion
from ..providers.storage import object_store
from ..schemas import SceneVisuals, Voice
from .department import write_status

_HYPERFRAMES_JSON = '{"$schema": "https://hyperframes.heygen.com/schema/hyperframes.json"}\n'


class PreparedScene(BaseModel):
    """One scene ready to render: its stamped composition, narration and length."""

    beat_id: str
    html: str
    duration: float
    audio: bytes | None = None


# --- pure helpers (unit-tested) ------------------------------------------------


def scaffold(project_dir: Path, html: str) -> None:
    """Write a composition as a one-off HyperFrames project the CLI can render."""
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "index.html").write_text(html)
    (project_dir / "hyperframes.json").write_text(_HYPERFRAMES_JSON)


def render_args(project_dir: Path, output: Path, node_bin: str, fps: int) -> list[str]:
    return [node_bin, "hyperframes", "render", str(project_dir),
            "-o", str(output), "-f", str(fps), "--format", "mp4"]


def mux_args(video: Path, audio: Path, output: Path) -> list[str]:
    # Keep the rendered video as-is; add the narration, trimmed to the shorter of
    # the two so a slightly-long clip never runs past the scene.
    return ["ffmpeg", "-y", "-i", str(video), "-i", str(audio),
            "-c:v", "copy", "-c:a", "aac", "-shortest", str(output)]


def concat_args(list_file: Path, output: Path) -> list[str]:
    # Re-encode on concat: per-scene clips can differ in exact stream params, and
    # `-c copy` rejects that. One deterministic pass keeps the join seamless.
    return ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
            "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", str(output)]


def concat_list(clips: list[Path]) -> str:
    """The ffmpeg concat-demuxer manifest — one `file '<path>'` line per clip."""
    return "".join(f"file '{clip}'\n" for clip in clips)


# --- the render (needs the HyperFrames CLI + ffmpeg) ---------------------------


def _run(args: list[str], cwd: Path, timeout: int) -> None:
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, cwd=str(cwd))
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout)[-500:])


def _render_one(work: Path, index: int, scene: PreparedScene, settings: Settings) -> Path:
    project = work / f"scene-{index}"
    scaffold(project, scene.html)
    silent = project / "video.mp4"
    _run(
        render_args(project, silent, settings.render_node_bin, settings.render_fps),
        work,
        settings.render_timeout_seconds,
    )
    if scene.audio is None:
        return silent
    audio = project / "narration.mp3"
    audio.write_bytes(scene.audio)
    muxed = project / "av.mp4"
    _run(mux_args(silent, audio, muxed), work, settings.render_timeout_seconds)
    return muxed


def render_cut_sync(render_id: str, scenes: list[PreparedScene], settings: Settings) -> Path | None:
    """Render every scene, mux its narration, and concatenate — status-reporting,
    never raising, so a background task records a failure instead of dying."""
    output = Path(settings.render_output_dir) / f"{render_id}.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    # Absolute, because the stitch commands run with cwd set to a temp dir; a
    # relative output would resolve there and vanish. Resolving against the
    # process cwd keeps it the same file the download endpoint reads.
    output = output.resolve()
    write_status(render_id, "running")
    try:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            clips = [_render_one(work, i, scene, settings) for i, scene in enumerate(scenes)]
            if not clips:
                write_status(render_id, "failed", "no HyperFrames scenes to render")
                return None
            list_file = work / "concat.txt"
            list_file.write_text(concat_list(clips))
            _run(concat_args(list_file, output), work, settings.render_timeout_seconds)
        write_status(render_id, "done")
        return output
    except subprocess.TimeoutExpired:
        write_status(render_id, "failed", "Render timed out")
        return None
    except Exception as exc:  # never kill the worker on a bad composition
        write_status(render_id, "failed", str(exc)[:500])
        return None


# --- preparation: load the cut server-side and resolve each scene --------------


async def _approved_or_latest(
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


async def prepare_scenes(
    session: AsyncSession, project_id: str, settings: Settings
) -> list[PreparedScene] | None:
    """Build the render inputs for a HyperFrames cut, or None if it is not one.

    Returns None when the project has no HyperFrames scenes (a React cut renders
    on the Remotion path instead). Each scene is resolved + stamped here — timing
    stays server-side — and its narration fetched from the object store. A scene
    without narration yet is skipped rather than rendered at an unknown length.
    """
    visuals_payload = await _approved_or_latest(session, project_id, ArtifactType.SCENE_VISUALS)
    if visuals_payload is None:
        return None
    visuals = SceneVisuals.model_validate(visuals_payload)
    if not any(scene.composition_html for scene in visuals.scenes):
        return None  # a React cut — not a HyperFrames render

    voice_payload = await _approved_or_latest(session, project_id, ArtifactType.VOICE)
    clips = {}
    if voice_payload is not None:
        clips = {clip.beat_id: clip for clip in Voice.model_validate(voice_payload).clips}

    store = object_store(settings)
    prepared: list[PreparedScene] = []
    for scene in visuals.scenes:
        if not scene.composition_html:
            continue
        clip = clips.get(scene.beat_id)
        if clip is None:
            continue  # narration not ready → no length to render at
        narration = clip.narration_timing()
        resolved = resolve_scene(scene.beats, narration)
        html = stamp(scene.composition_html, narration.duration, resolved.metadata)
        try:
            audio = await store.get(clip.audio_key)
        except Exception:
            audio = None
        prepared.append(
            PreparedScene(
                beat_id=scene.beat_id, html=html, duration=narration.duration, audio=audio
            )
        )
    return prepared or None
