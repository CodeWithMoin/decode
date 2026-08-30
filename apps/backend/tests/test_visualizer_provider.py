"""The visualizer can run on a different model/provider than the rest of the
author stack. Setting `visualizer_model` routes ONLY the Motion Designer to that
model via OpenRouter (base_url + openrouter key); everything else stays on OpenAI.
Asserted on the built runtime — no API call.
"""
from __future__ import annotations

from decode.agents.renderer import ModelVisualizer
from decode.config import Settings


def _settings(**over) -> Settings:
    base = dict(
        openai_api_key="oai-key",
        openai_base_url=None,
        openai_model="gpt-5.6-luna",
        visualizer="openai",
        openrouter_api_key="or-key",
        openrouter_base_url="https://openrouter.ai/api/v1",
    )
    base.update(over)
    return Settings(**base)


def test_visualizer_defaults_to_the_openai_model_and_client():
    v = ModelVisualizer(_settings())
    assert v.model == "gpt-5.6-luna"
    # Unchanged: the visualizer uses the OpenAI client just like the others.
    assert v.runtime.settings.openai_base_url is None
    assert v.runtime.settings.openai_api_key == "oai-key"


def test_visualizer_model_routes_only_the_visualizer_to_openrouter():
    v = ModelVisualizer(_settings(visualizer_model="google/gemini-3.6-flash"))
    assert v.model == "google/gemini-3.6-flash"
    # ONLY the visualizer's runtime is pointed at OpenRouter with the OR key.
    assert v.runtime.settings.openai_base_url == "https://openrouter.ai/api/v1"
    assert v.runtime.settings.openai_api_key == "or-key"


def test_visualizer_model_without_an_openrouter_key_stays_on_openai():
    # No OR key → don't silently break; keep the OpenAI client (model still set).
    v = ModelVisualizer(
        _settings(visualizer_model="google/gemini-3.6-flash", openrouter_api_key=None)
    )
    assert v.model == "google/gemini-3.6-flash"
    assert v.runtime.settings.openai_base_url is None
    assert v.runtime.settings.openai_api_key == "oai-key"
