"""Generate real scenes with the raw-remotion-v2 prompt and dump their sources.

Verification harness, not product code: three Bloom-filter beats through the
real Motion Designer, sources written for the still-render step to pick up.
"""

import asyncio
import json
from pathlib import Path

from decode.agents.registry import visualizer as build_visualizer
from decode.config import Settings
from decode.schemas import (
    Beat,
    BeatNarration,
    BriefSupport,
    PlanSection,
    ProductionIntent,
    Script,
    TeachingPlan,
)

INTENT = ProductionIntent(
    audience="Curious developers",
    runtime_mode="fixed",
    target_duration_seconds=60,
    depth="balanced",
    narration_style="friendly",
)

PLAN = TeachingPlan(
    structure_name="Problem to mechanism to payoff",
    sections=[
        PlanSection(id="s1", title="The problem", purpose="Why membership checks get expensive."),
        PlanSection(id="s2", title="The mechanism", purpose="How the bit array answers."),
    ],
    through_line="A Bloom filter answers 'have I seen this?' in constant space.",
    rationale="Open on the cost, then show the trick.",
    beats=[
        Beat(
            id="beat-01",
            title="The lookup problem",
            objective="Explain why checking membership in a huge set is costly",
            target_duration_seconds=18,
            section_id="s1",
            key_points=["A set of millions of keys", "Every lookup walks or hashes the whole store"],
            brief_support=BriefSupport(learning_objectives=[0]),
            visual_opportunity="A tiny query facing a huge wall of stored keys",
        ),
        Beat(
            id="beat-02",
            title="Hashing into bits",
            objective="Explain how k hash functions set bits in a fixed array",
            target_duration_seconds=22,
            section_id="s2",
            key_points=["Three hashes per key", "Each hash sets one bit", "The array never grows"],
            brief_support=BriefSupport(learning_objectives=[0]),
            visual_opportunity="One key fanning out through three hashes into a bit row",
        ),
        Beat(
            id="beat-03",
            title="The definite no",
            objective="Explain why a zero bit proves absence",
            target_duration_seconds=20,
            section_id="s2",
            key_points=["Any zero means never inserted", "All ones means only probably present"],
            brief_support=BriefSupport(learning_objectives=[0]),
            visual_opportunity="A lookup hitting a zero bit and short-circuiting to NO",
        ),
    ],
)

SCRIPT = Script(
    rationale="Plain, concrete, one idea per beat.",
    beats=[
        BeatNarration(
            beat_id="beat-01",
            narration=(
                "Imagine holding millions of keys, and someone asks: have you seen this one? "
                "Checking honestly means searching the whole store. "
                "Every single question pays that full price."
            ),
            segments=[
                "millions of stored keys",
                "one small question arrives",
                "every lookup pays the full search cost",
            ],
        ),
        BeatNarration(
            beat_id="beat-02",
            narration=(
                "A Bloom filter answers from a fixed row of bits. "
                "Each key runs through three hash functions. "
                "Each hash picks one position, and flips that bit to one. "
                "The row never grows, no matter how many keys arrive."
            ),
            segments=[
                "a fixed row of bits",
                "three hashes per key",
                "each hash flips one bit",
                "the row never grows",
            ],
        ),
        BeatNarration(
            beat_id="beat-03",
            narration=(
                "To check a key, look at its three bits. "
                "If even one is still zero, the key was never inserted — a definite no. "
                "If all three are one, the answer is only probably yes."
            ),
            segments=[
                "look up the key's three bits",
                "one zero proves absence",
                "all ones is only probably yes",
            ],
        ),
    ],
)


async def main() -> None:
    out = Path(__file__).parent / "verify_out"
    out.mkdir(exist_ok=True)
    provider = build_visualizer(Settings())
    visuals = await provider.generate(INTENT, PLAN, SCRIPT)
    meta = {}
    for scene in visuals.scenes:
        (out / f"{scene.beat_id}.tsx").write_text(scene.component_source)
        beat = next(b for b in PLAN.beats if b.id == scene.beat_id)
        meta[scene.beat_id] = {
            "duration_seconds": beat.target_duration_seconds,
            "controls": {c.name: c.default for c in scene.controls},
        }
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    print("scenes:", ", ".join(sorted(meta)))


if __name__ == "__main__":
    asyncio.run(main())
