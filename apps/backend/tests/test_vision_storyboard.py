"""The vision judge is storyboard-aware: when a scene's FocusedVisualDirection is
available, the judge is told the intended opening/closing state and the ordered
narration-anchored moments, and its rubric adds the checks that matter for "is it
directed" — no dead zone, not front-loaded, moments in order, resolved final
state. Without a storyboard it falls back to the generic motion/layout rubric.
Asserted on the pure prompt-builders — no model call.
"""
from __future__ import annotations

from decode.agents.fixtures import FakeVisualDirector
from decode.agents.renderer.vision import _judge_input, _judge_system
from decode.schemas import (
    Beat,
    BeatNarration,
    BriefSupport,
    PlanSection,
    ProductionIntent,
    Script,
    TeachingPlan,
)
from decode.visual_direction import focus_visual_direction

INTENT = ProductionIntent(
    audience="beginners", runtime_mode="fixed",
    target_duration_seconds=60, depth="balanced", narration_style="friendly",
)
PLAN = TeachingPlan(
    structure_name="One", sections=[PlanSection(id="s", title="S", purpose="Show it.")],
    through_line="t", rationale="r",
    beats=[Beat(
        id="beat-01", title="Weighing tokens", objective="Show attention weighting",
        target_duration_seconds=30, section_id="s", key_points=["k"],
        brief_support=BriefSupport(learning_objectives=[0]),
    )],
)
NARRATION = "Self attention weighs every token against every other token."
SCRIPT = Script(rationale="r", beats=[BeatNarration(beat_id="beat-01", narration=NARRATION)])
BEAT = PLAN.beats[0]


async def _focused():
    direction = await FakeVisualDirector().generate(INTENT, PLAN, SCRIPT)
    return focus_visual_direction(direction, "beat-01")


def test_judge_input_without_storyboard_is_the_generic_beat_only():
    payload = _judge_input(BEAT, NARRATION, None)
    assert payload["beat_title"] == "Weighing tokens"
    assert payload["narration"].startswith("Self attention")
    assert "storyboard" not in payload and "intended_moments" not in payload


def test_judge_system_without_storyboard_has_no_direction_clause():
    system = _judge_system(None)
    assert "MOTION" in system  # the generic rubric is intact
    assert "intended" not in system.lower()


async def test_judge_input_with_storyboard_carries_the_intended_arc_and_moments():
    focused = await _focused()
    payload = _judge_input(BEAT, NARRATION, focused)
    sb = payload["storyboard"]
    assert sb["opening_state"] == focused.storyboard.opening_state
    assert sb["closing_state"] == focused.storyboard.closing_state
    # The ordered, narration-anchored moments the render must honor.
    moments = payload["intended_moments"]
    assert len(moments) == len(focused.storyboard.operations)
    assert moments[0]["phrase"] == focused.storyboard.operations[0].anchor.phrase
    assert moments[0]["resulting_state"] == focused.storyboard.operations[0].resulting_state


async def test_judge_system_with_storyboard_adds_the_direction_checks():
    focused = await _focused()
    system = _judge_system(focused)
    low = system.lower()
    assert "dead" in low  # no dead zone
    assert "order" in low  # moments in order
    assert "intended" in low  # judged against the intended arc
