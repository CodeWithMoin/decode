"""Slice 2 — the Visualizer split into two agents with real in-process delegation.

The Visual Director (coordinator) produces an abstract `visual_plan`; the Renderer
(the persisted `visualizer/` department) turns it into `scene_visuals`. All offline on
fakes: no model call, no provider flipped.
"""

from __future__ import annotations

from test_visualizer import PLAN

from decode.agents.agent_config import AgentConfig
from decode.agents.agent_runtime import FakeAgentRuntime, SkillLibrary
from decode.agents.analogy.prompt import SKILLS as ANALOGY
from decode.agents.fixtures import FakeAnalogy, FakeRenderer, FakeVisualDirector
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
    # The one in-loop delegate today is the shared Analogy helper; renderer /
    # animation-reviewer are downstream steps, not in-loop delegates yet.
    assert config.multiagent == ("analogy",)
    # The custom skill it directs with, plus the vendored public ones.
    assert "visual-direction" in {r.name for r in config.skills}
    assert "apple-design" in {r.name for r in config.skills}


def test_renderer_config_keeps_the_persisted_scene_visuals_name():
    config = AgentConfig.from_skillset(RENDERER)
    assert config.produces == "scene_visuals"  # persisted contract, unchanged
    assert "hyperframes-animation" in {r.name for r in config.skills}


def test_analogy_config_reads_its_skill_md():
    config = AgentConfig.from_skillset(ANALOGY)
    assert config.name == "analogy"
    assert config.produces == "analogy"
    assert config.multiagent == ()  # a leaf helper — it delegates to no one
    assert "humanise" in {r.name for r in config.skills}


async def test_visual_director_delegates_to_analogy_in_process():
    """The coordinator → Analogy hand-off runs offline on fakes: the Director calls the
    analogy delegate and gets a grounded framing back to build the metaphor on."""
    config = AgentConfig.from_skillset(VISUAL_DIRECTOR)
    director = FakeAgentRuntime(config, delegates={"analogy": FakeAnalogy().as_delegate()})

    result = await director.run("Storyboard the Bloom-filter beats")

    assert "analogy" in result.delegated_to
    framing = result.output["delegations"]["analogy"]
    assert "coat-check" in framing["framing"]
    assert framing["mapping"]  # the part-by-part mapping the Director builds on
    # The coordinator pulled its declared skills on the way (progressive disclosure).
    assert "visual-direction" in result.skills_loaded


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


def _script():
    from decode.schemas import BeatNarration, Script

    return Script(
        rationale="r",
        beats=[BeatNarration(beat_id=b.id, narration="one two three four") for b in PLAN.beats],
    )
