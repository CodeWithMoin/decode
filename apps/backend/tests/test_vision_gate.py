"""The vision gate is opt-out and never blocks a build on tooling trouble."""

import pytest

from decode.agents.renderer.vision import vision_verdict
from decode.config import Settings
from decode.schemas import Beat, BriefSupport, SceneModule


def _beat() -> Beat:
    return Beat(
        id="beat-1",
        title="t",
        objective="o",
        target_duration_seconds=10,
        section_id="hook",
        key_points=["k"],
        brief_support=BriefSupport(key_concepts=["c"]),
    )


def _scene(source: str | None = "export default function Scene(){return null}") -> SceneModule:
    return SceneModule(beat_id="beat-1", controls=[], component_source=source)


@pytest.mark.asyncio
async def test_gate_off_means_no_opinion():
    settings = Settings(vision_gate="off", openai_api_key="sk-x")
    assert await vision_verdict(settings, _scene(), _beat(), "n", 10) is None


@pytest.mark.asyncio
async def test_no_key_means_no_opinion():
    settings = Settings(openai_api_key=None)
    assert await vision_verdict(settings, _scene(), _beat(), "n", 10) is None


@pytest.mark.asyncio
async def test_render_failure_means_no_opinion(monkeypatch):
    # A key is present and the gate is on, but the still render explodes —
    # the verdict is "no opinion", never an exception into the build.
    settings = Settings(openai_api_key="sk-x", render_cwd="/nonexistent")
    assert await vision_verdict(settings, _scene(), _beat(), "n", 10) is None


@pytest.mark.asyncio
async def test_composition_html_scenes_are_not_judged_here():
    settings = Settings(openai_api_key="sk-x")
    scene = SceneModule(beat_id="beat-1", controls=[], composition_html="<html/>")
    assert await vision_verdict(settings, scene, _beat(), "n", 10) is None
