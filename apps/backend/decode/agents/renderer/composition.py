"""The Visualizer→HyperFrames seam: resolve a scene's beats to timing metadata
and stamp it into the composition (VISUALIZER-TO-HYPERFRAMES §3).

The Visualizer emits a **duration-agnostic** HyperFrames composition plus named
`beats`, each declaring *when* by an anchor, never a second. Decode owns the
*when*: it resolves the anchors against the narration (`timing.py`), stamps the
scene's `data-duration` from the measured narration (ADR-005), and injects the
resolved `{beat, start, duration}` metadata for the composition to consume. Decode
stops at the metadata — it never assembles GSAP tweens; the composition (and its
runtime) turns the metadata into motion.
"""

from __future__ import annotations

import json

from pydantic import BaseModel

from ...schemas import VisualBeat
from ...timing import Anchor, NarrationTiming, UnresolvedAnchor, resolve_beats

# The template markers Decode fills. A composition authored against this contract
# leaves the scene length and the beat times to Decode — it writes neither.
DURATION_TOKEN = "{{SCENE_DURATION}}"
TIMING_MARKER = "<!-- decode:timing -->"


class BeatTiming(BaseModel):
    """One resolved beat handed to the composition: what fires, when, how long."""

    beat: str
    start: float
    duration: float


class ResolvedScene(BaseModel):
    """The timing metadata for a scene, plus any beat that could not resolve —
    surfaced, never silently dropped (a creator sees "this has nothing to attach
    to" rather than a beat firing at 0s)."""

    metadata: list[BeatTiming]
    unresolved: list[UnresolvedAnchor]


def resolve_scene(beats: list[VisualBeat], narration: NarrationTiming) -> ResolvedScene:
    """Resolve every beat's anchor against the narration → timing metadata.

    This is what a scene re-runs after its narration changes: same beats in, new
    times out, nothing hand-fixed. The beat name keys the anchor, so the metadata
    a composition reads by name follows the words.
    """
    anchors = [
        Anchor(**{**beat.anchor.model_dump(), "name": beat.name}) for beat in beats
    ]
    resolved = resolve_beats(anchors, narration)
    duration_by_name = {beat.name: beat.duration_s for beat in beats}
    metadata = [
        BeatTiming(beat=name, start=start, duration=duration_by_name[name])
        for name, start in sorted(resolved.times.items(), key=lambda kv: kv[1])
    ]
    return ResolvedScene(metadata=metadata, unresolved=resolved.unresolved)


def stamp(html: str, scene_duration: float, metadata: list[BeatTiming]) -> str:
    """Fill the composition's duration and beat-timing placeholders.

    `data-duration` becomes the measured narration length (the governing length,
    per HyperFrames), and the resolved beats land on `window.__decodeTiming` for
    the composition to read at build time. A composition with no markers is
    returned unchanged — stamping is idempotent-safe on already-concrete HTML.
    """
    payload = json.dumps([m.model_dump() for m in metadata], ensure_ascii=True)
    script = f"<script>window.__decodeTiming = {payload};</script>"
    return html.replace(DURATION_TOKEN, f"{scene_duration:g}").replace(TIMING_MARKER, script)
