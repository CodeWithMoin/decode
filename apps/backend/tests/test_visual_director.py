"""Slice 2 — the Visualizer split into two agents with real in-process delegation.

The Visual Director (coordinator) produces an abstract `visual_plan`; the Renderer
(the persisted `visualizer/` department) turns it into `scene_visuals`. All offline on
fakes: no model call, no provider flipped.
"""

from __future__ import annotations

from test_visualizer import PLAN

from decode.agents.agent_config import AgentConfig
from decode.agents.agent_runtime import FakeAgentRuntime, SkillLibrary
from decode.agents.fixtures import FakeRenderer, FakeVisualDirector
from decode.agents.renderer.composition import resolve_scene
from decode.agents.renderer.prompt import SKILLS as RENDERER
from decode.agents.renderer.validation import validate_scenes
from decode.agents.visual_director.prompt import SKILLS as VISUAL_DIRECTOR
from decode.schemas import ProductionIntent, VisualBeat, VisualPlan
from decode.timing import NarrationTiming, even_split_words

INTENT = ProductionIntent(
    audience="Curious beginners",
    runtime_mode="fixed",
    target_duration_seconds=60,
    depth="balanced",
    narration_style="friendly",
)


def test_visual_director_config_reads_its_skill_md():
    config = AgentConfig.from_skillset(VISUAL_DIRECTOR)
    assert config.name == "visual-director"
    assert config.produces == "visual_plan"
    assert config.multiagent == ("renderer", "animation-reviewer")
    # The custom skill it directs with, plus the vendored public ones.
    assert "visual-direction" in config.skills
    assert "apple-design" in config.skills


def test_renderer_config_keeps_the_persisted_scene_visuals_name():
    config = AgentConfig.from_skillset(RENDERER)
    assert config.produces == "scene_visuals"  # persisted contract, unchanged
    assert "hyperframes-animation" in config.skills


def test_the_custom_visual_direction_skill_is_loadable():
    """Authored by us, vendored beside the public skills, disclosed on demand."""
    library = SkillLibrary()  # repo .claude/skills
    assert "Visual Direction" in library.load("visual-direction")
    assert library.describe("visual-direction").startswith("The Visual Director's craft")


async def test_visual_plan_is_abstract_and_anchored_not_seconds():
    """Every storyboard moment resolves against the narration through an anchor —
    the plan carries no hardcoded seconds."""
    plan = await FakeVisualDirector().generate(INTENT, PLAN, _script())
    assert isinstance(plan, VisualPlan)
    assert plan.visual_findings["fixture"] is True

    board = plan.beats[0]
    moment = board.moments[0]
    # No markup on the abstract layer.
    assert not hasattr(moment, "composition_html")

    narration = NarrationTiming(duration=4.0, words=even_split_words("one two three four", 4.0))
    beats = [VisualBeat(name=m.anchor.name, anchor=m.anchor) for m in board.moments]
    resolved = resolve_scene(beats, narration)
    assert not resolved.unresolved  # the anchors resolve; nothing is a bare second


async def test_renderer_turns_the_plan_into_hyperframes_scene_visuals():
    plan = await FakeVisualDirector().generate(INTENT, PLAN, _script())
    visuals = await FakeRenderer().generate(INTENT, PLAN, plan)

    scene = visuals.scenes[0]
    assert scene.composition_html is not None  # HyperFrames-native
    assert scene.component_source is None  # never the retired React substrate
    assert "{{SCENE_DURATION}}" in scene.composition_html  # duration stays Decode's
    assert validate_scenes(visuals.scenes, PLAN) == []


async def test_coordinator_delegates_to_the_renderer_in_process():
    """The real slice-1 mechanism: the Visual Director's config exposes a `renderer`
    delegate; the coordinator hands off the assignment and gets scene_visuals back."""
    rendered = await FakeRenderer().generate(INTENT, PLAN, await FakeVisualDirector().generate(
        INTENT, PLAN, _script()
    ))

    async def renderer_delegate(assignment: str) -> str:
        return rendered.model_dump_json()

    config = AgentConfig.from_skillset(VISUAL_DIRECTOR)
    coordinator = FakeAgentRuntime(config, delegates={"renderer": renderer_delegate})
    result = await coordinator.run("Direct the video")

    assert "renderer" in result.delegated_to
    handed_back = result.output["delegations"]["renderer"]
    assert handed_back["visual_findings"]["fixture"] is True
    assert handed_back["scenes"][0]["composition_html"] is not None
    # The coordinator pulled its declared skills on the way (progressive disclosure).
    assert "visual-direction" in result.skills_loaded


def _script():
    from decode.schemas import BeatNarration, Script

    return Script(
        rationale="r",
        beats=[BeatNarration(beat_id=b.id, narration="one two three four") for b in PLAN.beats],
    )
