"""Slice 1 — the Agent abstraction: config parsing, progressive disclosure,
tool exposure, and a fake multiagent delegation round-trip. All offline (no model)."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from decode.agents.agent_config import AgentConfig
from decode.agents.agent_runtime import (
    DELEGATE_PREFIX,
    LOAD_SKILL,
    AgentRuntime,
    FakeAgentRuntime,
    SkillLibrary,
)
from decode.agents.skills import SkillSet
from decode.config import Settings

COORDINATOR_SKILL = """---
name: visual-director
model:
  id: gpt-5.6-luna
  effort: high
description: The Motion Designer's storyboard coordinator.
consumes: [teaching_plan, script]
produces: visual_plan
skills: [motion-doctrine, apple-design]
tools: [get_plan, get_script, render_export]
multiagent: [renderer, animation-reviewer]
metadata:
  team: motion
---

You are the Visual Director. You storyboard, you never emit HTML.
"""

SUB_SKILL = """---
name: renderer
model:
  id: gpt-5.6-luna
description: Turns a storyboard into a HyperFrames composition.
consumes: [visual_plan]
produces: scene_visuals
---

You are the Renderer.
"""


def _skillset(tmp_path: Path, body: str, folder: str) -> SkillSet:
    directory = tmp_path / folder
    directory.mkdir()
    (directory / "SKILL.md").write_text(body)
    return SkillSet(directory)


def test_agent_config_parses_frontmatter(tmp_path: Path) -> None:
    config = AgentConfig.from_skillset(_skillset(tmp_path, COORDINATOR_SKILL, "vd"))

    assert config.name == "visual-director"
    assert config.model.id == "gpt-5.6-luna"
    assert config.model.effort == "high"
    assert config.produces == "visual_plan"
    assert config.consumes == ("teaching_plan", "script")
    assert tuple(ref.name for ref in config.skills) == ("motion-doctrine", "apple-design")
    assert config.tools == ("get_plan", "get_script", "render_export")
    assert config.multiagent == ("renderer", "animation-reviewer")
    assert config.metadata == {"team": "motion"}
    # The system prompt is the markdown body, not the frontmatter.
    assert "You are the Visual Director" in config.system
    assert "name:" not in config.system


def test_missing_required_field_names_the_file(tmp_path: Path) -> None:
    bad = "---\nname: x\nmodel:\n  id: m\n---\n\nbody\n"  # no `produces`
    with pytest.raises(ValueError, match="produces"):
        AgentConfig.from_skillset(_skillset(tmp_path, bad, "bad"))


def test_skill_library_loads_on_demand(tmp_path: Path) -> None:
    """Progressive disclosure: describe reads frontmatter; the body loads only on `load`."""
    _skillset(tmp_path, SUB_SKILL, "renderer")
    library = SkillLibrary(root=tmp_path)

    assert library.describe("renderer").startswith("Turns a storyboard")
    assert "renderer" not in library._bodies  # describe did not pull the body
    body = library.load("renderer")
    assert "You are the Renderer" in body
    assert library._bodies["renderer"] == body  # cached


def test_skill_library_exposes_nested_markdown_depth_files(tmp_path: Path) -> None:
    _skillset(tmp_path, SUB_SKILL, "renderer")
    depth = tmp_path / "renderer" / "agents"
    depth.mkdir()
    (depth / "layout.md").write_text("Keep the focal object inside the safe frame.")
    (depth / "ignore.txt").write_text("not a skill reference")
    (tmp_path / "outside.md").write_text("not part of the skill")
    library = SkillLibrary(root=tmp_path)

    assert library.references("renderer") == ["agents/layout.md"]
    assert "safe frame" in library.read_reference("renderer", "agents/layout.md")
    with pytest.raises(ValueError):
        library.read_reference("renderer", "../outside.md")


def test_runtime_exposes_configured_tools(tmp_path: Path) -> None:
    """Tool surface: load_skill + the read-only registry tools + one delegate per sub-agent.
    Built without a client, so no credentials are touched."""
    _skillset(tmp_path, COORDINATOR_SKILL, "motion-doctrine")  # for describe()
    (tmp_path / "apple-design").mkdir()
    (tmp_path / "apple-design" / "SKILL.md").write_text(
        "---\nname: apple-design\ndescription: d\nproduces: x\n---\n\nbody\n"
    )
    config = AgentConfig.from_skillset(_skillset(tmp_path, COORDINATOR_SKILL, "vd"))
    runtime = AgentRuntime(Settings(), config, library=SkillLibrary(root=tmp_path))

    names = {tool["name"] for tool in runtime.function_tools()}
    assert LOAD_SKILL in names
    assert "get_plan" in names and "get_script" in names  # read-only registry tools
    assert "render_export" not in names  # writable → never exposed to the agent
    assert f"{DELEGATE_PREFIX}renderer" in names
    assert f"{DELEGATE_PREFIX}animation-reviewer" in names
    # The skill menu is disclosed by name in the system prompt, bodies are not.
    assert "load_skill" in runtime.system().lower() or LOAD_SKILL in runtime.system()


async def test_fake_delegation_round_trip(tmp_path: Path) -> None:
    """A fake coordinator delegates to a fake sub-agent and gets its artifact back."""
    sub_config = AgentConfig.from_skillset(_skillset(tmp_path, SUB_SKILL, "renderer"))
    sub = FakeAgentRuntime(sub_config)

    coordinator_body = COORDINATOR_SKILL.replace(
        "skills: [motion-doctrine, apple-design]", "skills: []"
    ).replace("multiagent: [renderer, animation-reviewer]", "multiagent: [renderer]")
    coordinator_config = AgentConfig.from_skillset(_skillset(tmp_path, coordinator_body, "vd"))
    coordinator = FakeAgentRuntime(coordinator_config, delegates={"renderer": sub.as_delegate()})

    result = await coordinator.run("Storyboard scene 2")

    assert result.delegated_to == ("renderer",)
    delegated = result.output["delegations"]["renderer"]
    assert delegated["fixture"] is True
    assert delegated["agent"] == "renderer"
    assert delegated["produces"] == "scene_visuals"
    assert delegated["assignment"] == "Storyboard scene 2"


class _Draft(BaseModel):
    value: str


async def test_repair_turn_receives_the_rejected_draft(tmp_path: Path) -> None:
    config = AgentConfig.from_skillset(_skillset(tmp_path, SUB_SKILL, "renderer"))
    runtime = AgentRuntime(Settings(), config, library=SkillLibrary(root=tmp_path))
    rejected_item = SimpleNamespace(type="message", content="rejected draft")
    responses = [
        SimpleNamespace(
            output=[rejected_item],
            output_parsed=_Draft(value="bad"),
            usage=None,
        ),
        SimpleNamespace(
            output=[],
            output_parsed=_Draft(value="good"),
            usage=None,
        ),
    ]
    seen_inputs: list[list[object]] = []

    class _Responses:
        async def parse(self, **kwargs):
            seen_inputs.append(list(kwargs["input"]))
            return responses.pop(0)

    runtime._client = SimpleNamespace(responses=_Responses())
    result = await runtime.run(
        "make it",
        _Draft,
        validate=lambda draft: ["invalid"] if draft.value == "bad" else [],
        repair_prompt=lambda problems: f"repair: {problems[0]}",
    )

    assert result.output == _Draft(value="good")
    assert result.repaired is True
    assert rejected_item in seen_inputs[1]
