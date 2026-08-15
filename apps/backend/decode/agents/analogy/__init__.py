"""The Analogy helper — a shared inline sub-agent on the slice-1 `AgentRuntime`.

Given a concept and a little context, it returns one concrete everyday framing (the
image, its part-by-part mapping, and where it breaks). It produces no stored artifact:
the Director, Writer and Visual Director delegate to it in-process and build the framing
into their own output. Its SKILL.md is the config.

Fake-first: `FakeAnalogy` (fixtures) returns a deterministic `Analogy`; `ModelAnalogy`
swaps in behind the same `generate(concept, context) -> Analogy` contract and the same
`as_delegate()` a coordinator wires as a tool.
"""

from __future__ import annotations

import json

from ...config import Settings
from ...schemas import Analogy
from ..agent_config import AgentConfig
from ..agent_runtime import AgentRuntime, Delegate
from .prompt import SKILLS


class ModelAnalogy:
    """The real Analogy helper: config + skills + the runtime's draft loop."""

    identifier = f"analogy/{SKILLS.version}"

    def __init__(self, settings: Settings):
        self.config = AgentConfig.from_skillset(SKILLS)
        self.runtime = AgentRuntime(settings, self.config)
        self.model = self.config.model.id

    async def generate(self, concept: str, context: str = "") -> Analogy:
        assignment = json.dumps(
            {"concept": concept, "context": context}, ensure_ascii=True, indent=2
        )
        result = await self.runtime.run(assignment, Analogy)
        return result.output

    def as_delegate(self) -> Delegate:
        """Bind to the `Analogy` schema so a coordinator can call it as a tool."""
        return self.runtime.as_delegate(Analogy)


def build(settings: Settings) -> ModelAnalogy:
    if not settings.openai_api_key:
        raise ValueError("DECODE_OPENAI_API_KEY is required for the Analogy helper")
    return ModelAnalogy(settings)
