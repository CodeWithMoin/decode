"""An agent's config, parsed from the same `SKILL.md` a department already has.

`Manifest` (skills.py) is what the *pipeline* reads about a department. `AgentConfig`
is the richer view the *agent runtime* consumes — model choice, the standing system
prompt, the skills it may pull on demand, the tools it may call, and the sub-agents it
may delegate to. Both are built from one `SkillSet._split()` so the two can never drift:
edit the frontmatter once, both views move together.

Foundation only: this sits *beside* `Manifest`, not in place of it. A department that
does not ship an agent never builds an `AgentConfig`, and one that does declares the
extra frontmatter (`model`, `skills`, `multiagent`, `metadata`) the pipeline ignores.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from .skills import SkillSet


class AgentModel(BaseModel):
    """Which model runs the agent, and how hard it thinks."""

    id: str
    effort: str = "medium"


class AgentConfig(BaseModel):
    """Everything the runtime needs to run one agent, read from its SKILL.md."""

    name: str
    model: AgentModel
    system: str  # the markdown body after the frontmatter
    description: str = ""
    consumes: tuple[str, ...] = ()
    produces: str
    skills: tuple[str, ...] = ()  # skill names, loaded on demand (progressive disclosure)
    tools: tuple[str, ...] = ()  # names into the orchestrator's tool registry
    multiagent: tuple[str, ...] = ()  # sub-agent names this coordinator may delegate to
    max_turns: int = 6  # observe/load/delegate rounds before the agent must produce output
    metadata: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_skillset(cls, skills: SkillSet) -> AgentConfig:
        front, body = skills._split()
        model = front.get("model") or {}
        if not model:
            # A missing model block would otherwise surface as a raw pydantic
            # "id field required", not the friendly frontmatter message below.
            raise ValueError(f"{skills.skill_path.name} frontmatter is missing 'model'.")
        try:
            return cls(
                name=front["name"],
                model=AgentModel(**model) if isinstance(model, dict) else AgentModel(id=str(model)),
                system=body,
                description=str(front.get("description", "")).strip(),
                consumes=tuple(front.get("consumes") or ()),
                produces=front["produces"],
                skills=tuple(front.get("skills") or ()),
                tools=tuple(front.get("tools") or ()),
                multiagent=tuple(front.get("multiagent") or ()),
                max_turns=int(front.get("max_turns", 6)),
                metadata=front.get("metadata") or {},
            )
        except KeyError as exc:
            raise ValueError(f"{skills.skill_path.name} frontmatter is missing {exc}.") from exc
