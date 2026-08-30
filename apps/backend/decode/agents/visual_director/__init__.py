"""Project-level visual direction before independent scene rendering."""

from __future__ import annotations

import json

from ...config import Settings
from ...schemas import ProductionIntent, Script, TeachingPlan, VisualDirection
from ...visual_direction import validate_visual_direction
from .. import tracing
from .._agent import ModelAgent
from ..contracts import ProviderUsage
from .prompt import SKILLS


class ModelVisualDirector(ModelAgent):
    identifier = f"visual-director/{SKILLS.version}"

    async def generate(
        self, intent: ProductionIntent, plan: TeachingPlan, script: Script
    ) -> VisualDirection:
        system = SKILLS.system()
        instructions = SKILLS.instructions(
            production_direction=json.dumps(
                {
                    "audience": intent.audience,
                    "depth": intent.depth,
                    "creative_brief": intent.creative_brief,
                    "brand": intent.brand.model_dump(mode="json"),
                },
                ensure_ascii=True,
                indent=2,
            ),
            plan=plan.model_dump_json(exclude={"plan_findings"}, indent=2),
            script=script.model_dump_json(exclude={"script_findings"}, indent=2),
        )
        history: list = [
            {"role": "user", "content": [{"type": "input_text", "text": instructions}]}
        ]

        with tracing.span(
            "visual-director",
            input={"structure_name": plan.structure_name, "beats": len(plan.beats)},
            metadata={"skills_version": SKILLS.version, "model": self.model},
        ) as run:
            draft, input_tokens, output_tokens = await self._draft(
                system, history, VisualDirection
            )
            turns = 1
            self.last_usage = ProviderUsage(self.model, input_tokens, output_tokens, turns)
            violations = validate_visual_direction(draft, plan, script)
            repair = {"ran": False, "initial_violations": [v["code"] for v in violations]}
            if violations:
                history.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": (
                                    (SKILLS.reflection() or "Repair the visual direction.")
                                    + "\n\nDeterministic violations:\n"
                                    + json.dumps(violations, ensure_ascii=True, indent=2)
                                ),
                            }
                        ],
                    }
                )
                second, extra_in, extra_out = await self._draft(
                    system, history, VisualDirection
                )
                input_tokens += extra_in
                output_tokens += extra_out
                turns += 1
                self.last_usage = ProviderUsage(
                    self.model, input_tokens, output_tokens, turns
                )
                remaining = validate_visual_direction(second, plan, script)
                repair = {
                    "ran": True,
                    "initial_violations": [v["code"] for v in violations],
                    "remaining_violations": [v["code"] for v in remaining],
                }
                if remaining:
                    codes = ", ".join(item["code"] for item in remaining)
                    raise ValueError(f"visual direction repair failed validation: {codes}")
                draft = second
            run.update(output={"beats": len(draft.storyboards), "repair": repair})

        return draft


def build(settings: Settings) -> ModelVisualDirector:
    if not settings.openai_api_key:
        raise ValueError(
            "DECODE_OPENAI_API_KEY is required when DECODE_VISUAL_DIRECTOR=openai"
        )
    return ModelVisualDirector(settings)
