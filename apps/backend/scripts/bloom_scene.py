"""Generate ONE bloom-filter scene through the Renderer (choreography path) and
write it as apps/frontend/scenes.json for `npx tsx scripts/render-video.ts`.

    cd apps/backend && uv run python scripts/bloom_scene.py

One OpenAI call (+ maybe one lint-repair). No voice — timing is even-split so we
can eyeball the animation fast. Needs DECODE_VISUALIZER=openai + key.
"""

import asyncio
import json
from pathlib import Path

from decode.agents.renderer import build as build_renderer
from decode.config import get_settings
from decode.schemas import (
    Beat,
    BeatNarration,
    BriefSupport,
    PlanPalette,
    PlanSection,
    ProductionIntent,
    Script,
    TeachingPlan,
)
from decode.timing import even_split_words

DUR = 20.0

PALETTE = PlanPalette(
    surface="#161a20", border="#2b333d", ink="#eef2f7", support="#8aa0b4", accent="#4b8ea1"
)

INTENT = ProductionIntent(
    audience="Curious developers new to data structures",
    runtime_mode="fixed",
    target_duration_seconds=60,
    depth="balanced",
    narration_style="friendly",
    palette=PALETTE.model_dump(),
)

PLAN = TeachingPlan(
    palette=PALETTE,
    structure_name="One idea",
    sections=[PlanSection(id="s", title="Bloom filters", purpose="Show how membership testing works.")],
    through_line="A bloom filter trades a little accuracy for a lot of memory.",
    rationale="A single-beat demo of the add/test mechanism.",
    beats=[
        Beat(
            id="beat-01",
            title="Setting and testing bits",
            objective="Show adding an item sets k bits, and testing checks those bits",
            target_duration_seconds=int(DUR),
            section_id="s",
            key_points=[
                "A bit array starts all zeros.",
                "Adding an item hashes it k ways and sets those k bits to 1.",
                "Testing checks those bits: any 0 means definitely-not; all 1 means probably-yes.",
                "A false positive happens when other items already set all those bits.",
            ],
            brief_support=BriefSupport(learning_objectives=[0]),
            visual_opportunity="A row of bit cells; an item's k hash arrows light up specific cells; a second lookup checks them.",
        )
    ],
)

NARRATION = (
    "A bloom filter starts as a row of bits, all set to zero. "
    "To add an item, we hash it three different ways, and set each of those three bits to one. "
    "To test whether we have seen an item, we check its three bits. "
    "If any bit is still zero, the item is definitely not in the set. "
    "If all three are one, it is probably in the set, because other items might have set those same bits."
)
SCRIPT = Script(rationale="r", beats=[BeatNarration(beat_id="beat-01", narration=NARRATION)])


async def main() -> None:
    settings = get_settings()
    renderer = build_renderer(settings)
    print(f"[1/1] Renderer ({renderer.model}, choreography={renderer.choreography}) — bloom filter…")
    visuals = await renderer.generate(INTENT, PLAN, SCRIPT)
    scene = visuals.scenes[0]
    src = scene.component_source
    print(f"    component_source: {len(src or '')} chars | repair: {visuals.visual_findings.get('repair')}")

    words = [
        {"word": w.text, "startInSeconds": w.start, "endInSeconds": w.end}
        for w in even_split_words(NARRATION, DUR)
    ]
    props = {
        "scenes": [
            {
                "id": "beat-01",
                "title": "Bloom filter",
                "dur": DUR,
                "componentSource": src,
                "controls": [c.model_dump() for c in scene.controls],
                "words": words,
            }
        ],
        "visualPick": {},
        "palette": PALETTE.model_dump(),
    }
    out = Path(__file__).resolve().parents[3] / "apps" / "frontend" / "scenes.json"
    out.write_text(json.dumps(props, indent=2))
    Path("bloom-component.tsx").write_text(src or "")
    print(f"    ✅ wrote {out}")
    print("    → cd apps/frontend && npx tsx scripts/render-video.ts scenes.json bloom.mp4")


asyncio.run(main())
