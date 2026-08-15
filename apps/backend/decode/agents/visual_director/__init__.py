"""The Visual Director — the Motion Designer as a coordinator agent.

It reads the approved plan, script and intent and produces an abstract `visual_plan`
(a metaphor and narration-anchored moments per beat); the Renderer sub-agent then turns
each beat into a HyperFrames composition (the persisted `scene_visuals` contract,
unchanged). It runs on the slice-1 `AgentRuntime` — its SKILL.md is the config.

Fake-first: `FakeVisualDirector` (fixtures) produces a deterministic `VisualPlan` and a
delegation round-trip runs offline on `FakeAgentRuntime`. `ModelVisualDirector` swaps in
behind the same `generate(intent, plan, script) -> VisualPlan` contract.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ...config import Settings
from ...schemas import BeatStoryboard, ProductionIntent, Script, TeachingPlan, VisualPlan
from ..agent_config import AgentConfig
from ..agent_runtime import AgentRuntime
from .prompt import SKILLS


class VisualPlanDraft(BaseModel):
    """What the model emits. No `visual_findings` — an open dict breaks strict
    structured outputs — so provenance is stamped by `generate`, not the model."""

    rationale: str = Field(min_length=1, max_length=1200)
    beats: list[BeatStoryboard] = Field(min_length=1)


class ModelVisualDirector:
    """The real Visual Director: config + skills + the runtime's draft loop."""

    identifier = f"visual_director/{SKILLS.version}"

    def __init__(self, settings: Settings):
        self.config = AgentConfig.from_skillset(SKILLS)
        self.runtime = AgentRuntime(settings, self.config)
        self.model = self.config.model.id

    async def generate(
        self, intent: ProductionIntent, plan: TeachingPlan, script: Script
    ) -> VisualPlan:
        narration = {beat.beat_id: beat.narration for beat in script.beats}
        assignment = json.dumps(
            {
                "production_intent": {
                    "audience": intent.audience,
                    "depth": intent.depth,
                    "brand_colors": intent.brand.colors,
                },
                "through_line": plan.through_line,
                # One entry per beat, in the plan's order, with the id the
                # storyboard must key each BeatStoryboard on.
                "beats": [
                    {
                        "beat_id": beat.id,
                        "title": beat.title,
                        "objective": beat.objective,
                        "key_points": beat.key_points,
                        "visual_opportunity": beat.visual_opportunity,
                        "narration": narration.get(beat.id, ""),
                    }
                    for beat in plan.beats
                ],
            },
            ensure_ascii=True,
            indent=2,
        )
        result = await self.runtime.run(assignment, VisualPlanDraft)
        draft = result.output
        return VisualPlan(
            rationale=draft.rationale,
            beats=draft.beats,
            visual_findings={
                "fixture": False,
                "model": self.model,
                "skills_version": SKILLS.version,
                # What the agent actually reached for this run — the dial-in trace.
                "skills_eager": [ref.name for ref in self.config.skills if ref.eager],
                "skills_on_demand": [ref.name for ref in self.config.skills if not ref.eager],
                "skills_loaded": list(result.skills_loaded),  # the on-demand ones it pulled
                "tools_called": list(result.tools_called),
                "delegated_to": list(result.delegated_to),
            },
        )


def build(settings: Settings) -> ModelVisualDirector:
    if not settings.openai_api_key:
        raise ValueError("DECODE_OPENAI_API_KEY is required for the Visual Director")
    return ModelVisualDirector(settings)
