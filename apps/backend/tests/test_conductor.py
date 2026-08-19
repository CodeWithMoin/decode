"""The conductor chooses among ready steps; failure means the classic order."""

import pytest

from decode.config import Settings
from decode.execution.conductor import FALLBACK_ORDER, STAGE_LABEL, choose_next


def _settings(**overrides) -> Settings:
    return Settings(orchestrator="fake", **overrides)


@pytest.mark.asyncio
async def test_single_candidate_needs_no_model():
    kind, reason = await choose_next(
        _settings(), "generate_teaching_plan", ["generate_script"], {"have": []}
    )
    assert kind == "generate_script"
    assert STAGE_LABEL["generate_script"] in reason


@pytest.mark.asyncio
async def test_no_key_falls_back_to_classic_order():
    # After the script both visuals and voice are ready; classic order says visuals.
    kind, reason = await choose_next(
        _settings(),
        "generate_script",
        ["generate_scene_visuals", "generate_voice"],
        {"have": ["script", "teaching_plan"]},
    )
    assert kind == "generate_scene_visuals"
    assert reason


@pytest.mark.asyncio
async def test_conductor_chain_mode_never_calls_a_model():
    kind, _ = await choose_next(
        _settings(conductor="chain", openai_api_key="sk-set-but-ignored"),
        "generate_script",
        ["generate_voice", "generate_scene_visuals"],
        {"have": []},
    )
    assert kind == "generate_scene_visuals"


def test_fallback_order_is_the_classic_chain():
    assert FALLBACK_ORDER == [
        "generate_teaching_plan",
        "generate_script",
        "generate_scene_visuals",
        "generate_voice",
    ]
