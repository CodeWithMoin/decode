"""The Visualizer department — the Motion Designer's scene visuals.

It reads an approved Script and its plan and writes the animation for each beat
as code: one React component against `@decode/animation-api`, plus the controls a
creator may turn on it.

Code rather than a JSON visual spec, because a spec can only express what its
schema anticipated and scene visuals are the place that ceiling binds hardest.
The cost is that output has to be checked statically before it is published,
which `validation.py` does — and that a module is only ever executed in a
browser preview or a sandboxed export renderer, never in this process.

Two departures from how Osmo does the same thing, both forced by Decode's own
rules. A scene never declares its duration, because the approved plan owns
runtime. And the `CONTROLS` manifest is generated here from declared structured
data rather than written by the model, so the settings panel reads JSON instead
of executing a module to discover its knobs.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ...config import Settings
from ...schemas import ProductionIntent, SceneModule, SceneVisuals, Script, TeachingPlan
from .. import tracing
from ..contracts import ProviderUsage
from .prompt import SKILLS
from .validation import RUNTIME_VERSION, repair_message, validate_scenes

# One draft, plus at most one targeted repair. There is no tool loop to bound.
MAX_TURNS = 2


class SceneVisualsDraft(BaseModel):
    """What the model produces, without the provenance the harness assembles."""

    rationale: str = Field(min_length=1, max_length=1200)
    scenes: list[SceneModule] = Field(min_length=1)


class OpenAIVisualizer:
    identifier = f"visualizer/{SKILLS.version}"

    def __init__(self, settings: Settings):
        from openai import AsyncOpenAI

        self.settings = settings
        self.model = settings.openai_model
        # Traced or not depending on tracing.install_openai_tracing(), which
        # patches this class in place at worker startup.
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.last_usage: ProviderUsage | None = None

    async def _draft(self, system: str, history: list) -> tuple[SceneVisualsDraft, int, int]:
        response = await self.client.responses.parse(
            model=self.model,
            instructions=system,
            input=history,
            text_format=SceneVisualsDraft,
        )
        if response.output_parsed is None:
            raise RuntimeError("visualizer returned no parsed scenes")
        history.extend(response.output)
        usage = response.usage
        return (
            response.output_parsed,
            usage.input_tokens if usage else 0,
            usage.output_tokens if usage else 0,
        )

    async def generate(
        self, intent: ProductionIntent, plan: TeachingPlan, script: Script
    ) -> SceneVisuals:
        # Read the owner-authored skills before spending anything: a missing or
        # placeholder skill file must fail here, not after an API call.
        system = SKILLS.system()
        narration = {item.beat_id: item.narration for item in script.beats}
        instructions = SKILLS.instructions(
            visual_direction=json.dumps(
                {
                    "audience": intent.audience,
                    "depth": intent.depth,
                    "brand_colors": intent.brand.colors,
                    "brand_guidelines": intent.brand.guidelines,
                },
                ensure_ascii=True,
                indent=2,
            ),
            beats=json.dumps(
                [
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
                ensure_ascii=True,
                indent=2,
            ),
            # The same declaration the runtime package exports, so the model and
            # the browser are never shown two different APIs.
            scene_api=SKILLS.reference("scene-api"),
        )

        history: list = [
            {"role": "user", "content": [{"type": "input_text", "text": instructions}]}
        ]

        with tracing.span(
            "visualizer",
            input={
                "audience": intent.audience,
                "structure_name": plan.structure_name,
                "beats": len(plan.beats),
            },
            metadata={
                "skills_version": SKILLS.version,
                "runtime_version": RUNTIME_VERSION,
                "model": self.model,
            },
        ) as run:
            with tracing.span("draft"):
                draft, input_tokens, output_tokens = await self._draft(system, history)
            turns = 1

            violations = validate_scenes(draft.scenes, plan)
            repair: dict = {
                "ran": False,
                "initial_violations": [item["code"] for item in violations],
            }
            if violations:
                guidance = SKILLS.reflection() or "Repair the scenes using the listed violations."
                history.append(
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": repair_message(violations, guidance)}
                        ],
                    }
                )
                with tracing.span("repair"):
                    second, extra_in, extra_out = await self._draft(system, history)
                remaining = validate_scenes(second.scenes, plan)
                repair = {
                    "ran": True,
                    "initial_violations": [item["code"] for item in violations],
                    "remaining_violations": [item["code"] for item in remaining],
                    "input_tokens": extra_in,
                    "output_tokens": extra_out,
                }
                if remaining:
                    codes = ", ".join(item["code"] for item in remaining)
                    # Never publish a module that failed a static check. This is
                    # the gate that keeps the preview from loading code nobody
                    # verified, so it fails the run rather than degrading.
                    raise ValueError(f"visualizer repair failed validation: {codes}")
                draft = second
                input_tokens += extra_in
                output_tokens += extra_out
                turns += 1

            run.update(
                output={
                    "scenes": len(draft.scenes),
                    "controls": sum(len(scene.controls) for scene in draft.scenes),
                    "repair": repair,
                }
            )

        self.last_usage = ProviderUsage(self.model, input_tokens, output_tokens, turns)

        return SceneVisuals(
            **draft.model_dump(),
            visual_findings={
                # Never claim more than the run actually did.
                "fixture": False,
                "model": self.model,
                "skills_version": SKILLS.version,
                # Which API the scenes were written against, so a v1 scene stays
                # readable when v2 lands.
                "runtime_version": RUNTIME_VERSION,
                "repair": repair,
            },
        )


def build(settings: Settings) -> OpenAIVisualizer:
    if not settings.openai_api_key:
        raise ValueError("DECODE_OPENAI_API_KEY is required when DECODE_VISUALIZER=openai")
    return OpenAIVisualizer(settings)
