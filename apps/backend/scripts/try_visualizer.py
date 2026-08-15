"""Run ONLY the Motion Designer (Visualizer) against openai — no project, no
pipeline. Feeds a tiny 1-beat plan + script, gets back a HyperFrames composition
(validated by the real linter inside generate), then stamps it with fake
narration timing and renders it to an MP4.

    cd apps/backend && uv run python scripts/try_visualizer.py

Needs DECODE_VISUALIZER=openai + DECODE_OPENAI_API_KEY (already in .env). One
OpenAI call (+ maybe one lint-repair). Everything else is local.
"""

import asyncio
from pathlib import Path

from decode.config import get_settings
from decode.departments.registry import visualizer as build_visualizer
from decode.departments.visualizer.composition import resolve_scene, stamp
from decode.renders.hyperframes import PreparedScene, render_cut_sync
from decode.schemas import (
    Beat,
    BeatNarration,
    BriefSupport,
    PlanSection,
    ProductionIntent,
    Script,
    TeachingPlan,
)
from decode.timing import NarrationTiming, even_split_words

INTENT = ProductionIntent(
    audience="Curious beginners",
    runtime_mode="fixed",
    target_duration_seconds=60,
    depth="balanced",
    narration_style="friendly",
)

PLAN = TeachingPlan(
    structure_name="One idea",
    sections=[PlanSection(id="s", title="Self-attention", purpose="Show how it weighs tokens.")],
    through_line="Attention lets a model weigh what matters.",
    rationale="A single-beat demo.",
    beats=[
        Beat(
            id="beat-01",
            title="Weighing every token",
            objective="Show self-attention scoring each token against every other",
            target_duration_seconds=60,
            section_id="s",
            key_points=["Each token attends to all others.", "Weights sum to one."],
            brief_support=BriefSupport(learning_objectives=[0]),
            visual_opportunity="A row of token chips with connecting weights lighting up.",
        )
    ],
)

NARRATION = "Self attention weighs every token against every other token in the sequence."
SCRIPT = Script(rationale="r", beats=[BeatNarration(beat_id="beat-01", narration=NARRATION)])


async def main() -> None:
    settings = get_settings()
    print(f"provider={settings.visualizer}  model={settings.openai_model}\n")
    if settings.visualizer != "openai":
        print("!! DECODE_VISUALIZER is not 'openai' — set it in apps/backend/.env")
        return

    print("Calling the Motion Designer…")
    visuals = await build_visualizer(settings).generate(INTENT, PLAN, SCRIPT)
    scene = visuals.scenes[0]

    # Which substrate did the model actually emit? This is the thing to check.
    substrate = (
        "composition_html (HyperFrames ✅)" if scene.composition_html
        else "component_source (React ❌ — the model ignored the HyperFrames contract)"
    )
    print(f"\n=== SUBSTRATE: {substrate} ===")
    print("\n--- rationale ---\n" + visuals.rationale)
    print("\n--- beats (anchors) ---")
    for beat in scene.beats:
        print(f"  {beat.name}: {beat.anchor.kind} "
              f"{beat.anchor.phrase or beat.anchor.at}  ({beat.duration_s}s)")

    if not scene.composition_html:
        # Save what it did emit so we can see why the contract didn't take.
        out_html = Path("visualizer_demo.react.txt").resolve()
        out_html.write_text(scene.component_source or "")
        print(f"\nNo HyperFrames composition. React source saved: {out_html}")
        return

    comp_path = Path("visualizer_demo.html").resolve()
    comp_path.write_text(scene.composition_html)
    print(f"\n--- composition_html saved: {comp_path} ---")
    print(scene.composition_html[:1200])

    # Stamp with fake narration timing and render to a video.
    duration = 6.0
    narration = NarrationTiming(duration=duration, words=even_split_words(NARRATION, duration))
    resolved = resolve_scene(scene.beats, narration)
    if resolved.unresolved:
        print("\n(unresolved anchors:", [u.name for u in resolved.unresolved], ")")
    html = stamp(scene.composition_html, duration, resolved.metadata)

    print("\nRendering with hyperframes (first run may download chromium — give it a minute)…")
    out = render_cut_sync(
        "visualizer_demo",
        [PreparedScene(beat_id="beat-01", html=html, duration=duration, audio=None)],
        settings,
    )
    if out and out.exists():
        print(f"\n✅ MP4: {out}  ({out.stat().st_size} bytes)")
    else:
        from decode.renders.department import read_status

        status = read_status("visualizer_demo")
        print(f"\n❌ render failed: {status.get('error', '(no status written)')}")


asyncio.run(main())
