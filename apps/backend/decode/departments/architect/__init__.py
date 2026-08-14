"""The Architect department — the Director crew role's Teaching Plan stage.

It reads an approved Production Brief and decides the shape of the video: which
beats, in what order, how long each gets, and which named section each belongs to. It
writes no narration; that is the Author department's craft, and keeping them
apart is what lets a creator reorder beats without discarding writing they liked.

No tools, unlike Intake. Intake needed `record_finding` because it was reading a
source document and every claim had to be tied back to a page. The Architect is
handed a brief that has already been grounded, so there is nothing left to cite —
its inputs are small enough to sit in the prompt, and the decisions it makes are
structural rather than factual. A tool here would be ceremony.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ...config import Settings
from ...schemas import Beat, PlanSection, ProductionBrief, ProductionIntent, TeachingPlan
from .. import tracing
from ..contracts import ProviderUsage
from .prompt import SKILLS
from .validation import repair_message, validate_plan

# One draft, plus at most one targeted repair. There is no tool loop to bound.
MAX_TURNS = 2


class TeachingPlanDraft(BaseModel):
    """What the model produces.

    Not `TeachingPlan` itself: that carries `plan_findings`, a free-form dict
    which strict structured outputs reject and which the model should not be
    authoring anyway. Provenance is assembled by the harness, so a plan cannot
    claim a brief it never read.
    """

    structure_name: str = Field(min_length=1, max_length=120)
    sections: list[PlanSection] = Field(min_length=1, max_length=8)
    through_line: str = Field(min_length=1, max_length=500)
    rationale: str = Field(min_length=1, max_length=1200)
    beats: list[Beat] = Field(min_length=1)


class OpenAIArchitect:
    identifier = f"architect/{SKILLS.version}"

    def __init__(self, settings: Settings):
        from openai import AsyncOpenAI

        self.settings = settings
        self.model = settings.openai_model
        # Traced or not depending on tracing.install_openai_tracing(), which
        # patches this class in place at worker startup.
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.last_usage: ProviderUsage | None = None

    async def _draft(self, system: str, history: list) -> tuple[TeachingPlanDraft, int, int]:
        response = await self.client.responses.parse(
            model=self.model,
            instructions=system,
            input=history,
            text_format=TeachingPlanDraft,
        )
        if response.output_parsed is None:
            raise RuntimeError("architect returned no parsed plan")
        history.extend(response.output)
        usage = response.usage
        return (
            response.output_parsed,
            usage.input_tokens if usage else 0,
            usage.output_tokens if usage else 0,
        )

    async def generate(self, intent: ProductionIntent, brief: ProductionBrief) -> TeachingPlan:
        # Read the owner-authored skills before spending anything: a missing or
        # placeholder skill file must fail here, not after an API call.
        system = SKILLS.system()
        instructions = SKILLS.instructions(
            planning_direction=json.dumps(
                {
                    "audience": intent.audience,
                    "depth": intent.depth,
                    "runtime_mode": intent.runtime_mode,
                    "target_duration_seconds": intent.target_duration_seconds,
                    "creative_brief": intent.creative_brief,
                },
                ensure_ascii=True,
                indent=2,
            ),
            brief=brief.model_dump_json(exclude={"source_findings"}, indent=2),
        )

        history: list = [
            {"role": "user", "content": [{"type": "input_text", "text": instructions}]}
        ]

        with tracing.span(
            "architect",
            input={
                "audience": intent.audience,
                "depth": intent.depth,
                "runtime_mode": intent.runtime_mode,
                "target_duration_seconds": intent.target_duration_seconds,
                "brief_title": brief.title,
            },
            metadata={"skills_version": SKILLS.version, "model": self.model},
        ) as run:
            with tracing.span("draft"):
                draft, input_tokens, output_tokens = await self._draft(system, history)
            turns = 1

            violations = validate_plan(draft.sections, draft.beats, intent, brief)
            repair: dict = {
                "ran": False,
                "initial_violations": [item["code"] for item in violations],
            }
            if violations:
                guidance = SKILLS.reflection() or "Repair the plan using the listed violations."
                history.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": repair_message(violations, guidance),
                            }
                        ],
                    }
                )
                with tracing.span("repair"):
                    second, extra_in, extra_out = await self._draft(system, history)
                remaining = validate_plan(second.sections, second.beats, intent, brief)
                before, after = draft.model_dump(), second.model_dump()
                repair = {
                    "ran": True,
                    "initial_violations": [item["code"] for item in violations],
                    "remaining_violations": [item["code"] for item in remaining],
                    "changed_fields": sorted(k for k in after if before[k] != after[k]),
                    "input_tokens": extra_in,
                    "output_tokens": extra_out,
                }
                if remaining:
                    codes = ", ".join(item["code"] for item in remaining)
                    raise ValueError(f"architect repair failed deterministic validation: {codes}")
                draft = second
                input_tokens += extra_in
                output_tokens += extra_out
                turns += 1

            run.update(
                output={
                    "structure_name": draft.structure_name,
                    "through_line": draft.through_line,
                    "beats": [beat.title for beat in draft.beats],
                    "runtime_seconds": sum(b.target_duration_seconds for b in draft.beats),
                    "repair": repair,
                }
            )

        self.last_usage = ProviderUsage(self.model, input_tokens, output_tokens, turns)

        return TeachingPlan(
            **draft.model_dump(),
            plan_findings={
                # Never claim more than the run actually did.
                "fixture": False,
                "model": self.model,
                "skills_version": SKILLS.version,
                "brief_title": brief.title,
                "repair": repair,
                # Derived here rather than stored on the plan: the sum is the
                # only runtime that exists until audio is generated.
                "planned_runtime_seconds": sum(b.target_duration_seconds for b in draft.beats),
            },
        )


def build(settings: Settings) -> OpenAIArchitect:
    if not settings.openai_api_key:
        raise ValueError("DECODE_OPENAI_API_KEY is required when DECODE_ARCHITECT=openai")
    return OpenAIArchitect(settings)
