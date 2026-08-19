"""The vision gate — a model looks at rendered frames of a scene.

Static validation catches what a regex can see; the runtime inspector warns in
a dev console nobody watches during a build. This gate closes the loop the
product actually needs: render three stills of the scene exactly as a viewer
would see it (over the host stage, at early/middle/late progress), show them
to a multimodal model beside the beat's teaching intent, and get a verdict —
pass, or a fix direction the repair path can act on.

Infrastructure failures never block a build: a render error, a missing key, or
a timeout returns None, meaning "no opinion", and the scene proceeds on the
static gates alone. The vision loop improves quality; it must never become the
reason a video doesn't exist.
"""

from __future__ import annotations

import asyncio
import base64
import json
import shutil
import subprocess
import uuid
from pathlib import Path

from pydantic import BaseModel

from ...config import Settings
from ...schemas import Beat, SceneModule


class VisionVerdict(BaseModel):
    passes: bool
    # What a viewer would notice is wrong, in plain language.
    issues: list[str]
    # One concrete direction the repair turn can act on; empty when passing.
    fix_direction: str


_STILL_TIMEOUT_SECONDS = 120
_JUDGE_TIMEOUT_SECONDS = 60


def _render_stills(settings: Settings, scene: SceneModule, duration_seconds: float) -> list[Path]:
    """Render early/middle/late frames of one scene via the Node still script.

    Synchronous on purpose — callers wrap it in a thread. Raises on failure;
    the caller turns any failure into "no opinion".
    """
    work = Path(settings.render_cwd) / ".data" / "vision" / uuid.uuid4().hex
    work.mkdir(parents=True, exist_ok=True)
    scenes_json = work / "scenes.json"
    scenes_json.write_text(
        json.dumps(
            {
                "scenes": [
                    {
                        "id": scene.beat_id,
                        "title": scene.beat_id,
                        "dur": max(4, duration_seconds),
                        "on": True,
                        "componentSource": scene.component_source,
                        "controls": [],
                    }
                ],
                "visualPick": {},
            }
        )
    )
    result = subprocess.run(
        [
            settings.render_node_bin,
            "tsx",
            "scripts/render-stills.ts",
            str(scenes_json),
            str(work),
        ],
        capture_output=True,
        text=True,
        timeout=_STILL_TIMEOUT_SECONDS,
        cwd=settings.render_cwd,
    )
    if result.returncode != 0:
        raise RuntimeError(f"still render failed: {result.stderr[-500:]}")
    stills = sorted(work.glob("p*.png"))
    if not stills:
        raise RuntimeError("still render produced no frames")
    return stills


def cleanup_stills(stills: list[Path]) -> None:
    if stills:
        shutil.rmtree(stills[0].parent, ignore_errors=True)


async def vision_verdict(
    settings: Settings,
    scene: SceneModule,
    beat: Beat,
    narration: str,
    duration_seconds: float,
) -> VisionVerdict | None:
    """Judge one scene's rendered frames. None means "no opinion" — gate off,
    no key, or the tooling failed — and the scene proceeds on static gates."""
    if settings.vision_gate == "off" or not settings.openai_api_key:
        return None
    if not scene.component_source:
        return None  # HyperFrames scenes render elsewhere; not judged here yet

    stills: list[Path] = []
    try:
        stills = await asyncio.to_thread(_render_stills, settings, scene, duration_seconds)

        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
        images = [
            {
                "type": "input_image",
                "image_url": "data:image/png;base64,"
                + base64.b64encode(still.read_bytes()).decode(),
            }
            for still in stills
        ]
        async with asyncio.timeout(_JUDGE_TIMEOUT_SECONDS):
            response = await client.responses.parse(
                model=settings.openai_model,
                instructions=(
                    "You review one scene of an educational animated video. The three "
                    "frames are early, middle and late moments of the scene, exactly as "
                    "a viewer sees them. Judge only what is visible: text readable at a "
                    "glance; nothing overlapping or cut off at the frame edge; the "
                    "composition fills the stage rather than huddling small in a corner; "
                    "the visual actually shows the idea the beat teaches, not decoration; "
                    "and NO sampled frame is empty or near-empty — the scene must read as "
                    "one diagram assembling, so a middle or late frame showing a bare "
                    "stage or a single stray label is an automatic fail. Minor "
                    "imperfection passes — fail only what a viewer would notice as "
                    "wrong. When failing, give ONE concrete fix direction an animator "
                    "can act on, in plain language."
                ),
                input=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": json.dumps(
                                    {
                                        "beat_title": beat.title,
                                        "objective": beat.objective,
                                        "narration": narration[:600],
                                    },
                                    ensure_ascii=True,
                                ),
                            },
                            *images,
                        ],
                    }
                ],
                text_format=VisionVerdict,
            )
        return response.output_parsed
    except Exception:
        return None  # tooling trouble is never a build failure
    finally:
        cleanup_stills(stills)
