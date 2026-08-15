"""Render the FULL narrated video from the cached dial-in artifacts.

    cd apps/backend && uv run python scripts/render_full.py

Reuses dial-in-script.json + dial-in-scene-visuals.json written by scripts/dial_in.py
(run that first). Reads every passage aloud with the real voice (Fish Audio — the
narration is the timing authority, ADR-005), stamps each scene to its measured
length, and stitches the whole cut into one MP4. Needs DECODE_FISH_AUDIO_API_KEY +
DECODE_FISH_AUDIO_REFERENCE_ID.
"""

import asyncio
from pathlib import Path

from decode.agents.renderer.composition import resolve_scene, stamp
from decode.agents.voice import build as build_voice
from decode.config import get_settings
from decode.providers.storage import object_store
from decode.renders.hyperframes import PreparedScene, render_cut_sync
from decode.schemas import ProductionIntent, SceneVisuals, Script
from decode.timing import NarrationTiming, even_split_words

# Must match the intent dial_in.py ran the chain under.
INTENT = ProductionIntent(
    audience="Curious developers new to data structures",
    runtime_mode="fixed",
    target_duration_seconds=180,
    depth="balanced",
    narration_style="friendly",
)


async def main() -> None:
    settings = get_settings()
    script_path = Path("dial-in-script.json")
    visuals_path = Path("dial-in-scene-visuals.json")
    if not (script_path.exists() and visuals_path.exists()):
        print("!! run scripts/dial_in.py first — need dial-in-script.json + scene-visuals.json")
        return
    if not settings.fish_audio_api_key or not settings.fish_audio_reference_id:
        print("!! set DECODE_FISH_AUDIO_API_KEY + DECODE_FISH_AUDIO_REFERENCE_ID to narrate")
        return

    script = Script.model_validate_json(script_path.read_text())
    visuals = SceneVisuals.model_validate_json(visuals_path.read_text())

    print(f"[1/2] Narrator (Fish Audio) — reading {len(script.beats)} passages aloud…")
    voice = await build_voice(settings).generate(INTENT, script)
    store = object_store(settings)
    clip_by_beat = {c.beat_id: c for c in voice.clips}
    text_by_beat = {b.beat_id: b.narration for b in script.beats}

    prepared: list[PreparedScene] = []
    for scene in visuals.scenes:
        clip = clip_by_beat.get(scene.beat_id)
        if clip is None or not scene.composition_html:
            print(f"    - skipped {scene.beat_id}: no narration or no composition")
            continue
        duration = clip.duration_seconds
        # Fish returns no per-word alignment; reconstruct even-split words so the
        # scene's phrase anchors still resolve. The measured length stays authority.
        words = clip.words or even_split_words(text_by_beat.get(scene.beat_id, ""), duration)
        narration = NarrationTiming(duration=duration, words=words)
        try:
            resolved = resolve_scene(scene.beats, narration)
            html = stamp(scene.composition_html, duration, resolved.metadata)
        except Exception as exc:  # one unresolvable scene must not sink the whole cut
            print(f"    - skipped {scene.beat_id}: {exc}")
            continue
        audio = await store.get(clip.audio_key)
        prepared.append(
            PreparedScene(beat_id=scene.beat_id, html=html, duration=duration, audio=audio)
        )

    if not prepared:
        print("!! no scenes could be prepared")
        return

    total = sum(p.duration for p in prepared)
    print(f"[2/2] Rendering + stitching {len(prepared)} scenes ({total:.0f}s) → MP4 (chromium)…")
    out = render_cut_sync("decode_full", prepared, settings)
    print(f"    ✅ full video: {out}" if out else "    ❌ render failed — see status file")


asyncio.run(main())
