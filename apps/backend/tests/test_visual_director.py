"""The Visual Director provider boundary and deterministic fixture."""

from __future__ import annotations

import pytest

from decode.agents.fixtures import FakeVisualDirector
from decode.agents.visual_director import ModelVisualDirector, build
from decode.config import Settings
from decode.schemas import (
    Beat,
    BeatNarration,
    BriefSupport,
    PlanSection,
    ProductionIntent,
    Script,
    TeachingPlan,
    VisualDirection,
)
from decode.visual_direction import validate_visual_direction


def inputs() -> tuple[ProductionIntent, TeachingPlan, Script]:
    intent = ProductionIntent(
        audience="Curious beginners",
        target_duration_seconds=60,
        runtime_mode="fixed",
        depth="balanced",
        narration_style="friendly",
    )
    beats = [
        Beat(
            id=f"beat-{index}",
            title=f"Part {index}",
            objective=f"Understand part {index}",
            target_duration_seconds=30,
            section_id="main",
            key_points=[f"Point {index}"],
            brief_support=BriefSupport(learning_objectives=[0]),
        )
        for index in (1, 2)
    ]
    plan = TeachingPlan(
        structure_name="Build the mechanism",
        sections=[PlanSection(id="main", title="Main", purpose="Teach in order")],
        through_line="The first relationship produces the second.",
        rationale="Dependencies come before consequences.",
        beats=beats,
    )
    script = Script(
        rationale="Each passage names its focal relationship.",
        beats=[
            BeatNarration(
                beat_id=beat.id,
                narration=f"This is {beat.title.lower()}, and its relationship now resolves.",
            )
            for beat in beats
        ],
    )
    return intent, plan, script


async def test_fixture_direction_is_source_valid_and_round_trips() -> None:
    intent, plan, script = inputs()
    director = FakeVisualDirector()
    direction = await director.generate(intent, plan, script)

    assert validate_visual_direction(direction, plan, script) == []
    assert VisualDirection.model_validate(direction.model_dump(mode="json")) == direction
    assert [storyboard.beat_id for storyboard in direction.storyboards] == [
        "beat-1",
        "beat-2",
    ]
    assert len(direction.handoffs) == 1
    assert direction.handoffs[0].intent == "reset"
    assert director.last_usage is None


def test_model_provider_requires_credentials() -> None:
    with pytest.raises(ValueError, match="DECODE_OPENAI_API_KEY"):
        build(Settings(visual_director="openai", openai_api_key=None))


async def test_model_provider_repairs_source_invalid_direction(monkeypatch) -> None:
    intent, plan, script = inputs()
    valid = await FakeVisualDirector().generate(intent, plan, script)
    invalid_payload = valid.model_dump(mode="json")
    invalid_payload["rhythm"]["beats"][0]["beat_id"] = "beat-invented"
    invalid_payload["storyboards"][0]["beat_id"] = "beat-invented"
    invalid_payload["handoffs"][0]["from_beat_id"] = "beat-invented"
    invalid = VisualDirection.model_validate(invalid_payload)
    drafts = iter([(invalid, 10, 20), (valid, 3, 4)])

    async def fake_draft(system, history, text_format):
        return next(drafts)

    director = ModelVisualDirector(Settings(openai_api_key="test-key"))
    monkeypatch.setattr(director, "_draft", fake_draft)
    result = await director.generate(intent, plan, script)

    assert result == valid
    assert director.last_usage is not None
    assert director.last_usage.input_tokens == 13
    assert director.last_usage.output_tokens == 24
    assert director.last_usage.turns == 2
