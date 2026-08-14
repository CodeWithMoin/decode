"""The Author department — the Writer crew role's Script stage.

It reads an approved Teaching Plan and writes the words a viewer hears, one
passage per beat. It changes no beat, no order and no duration: those are the
creator's approved decisions, and a Writer that quietly retimed the video would
make the plan's approval meaningless.

No tools, for the same reason the Architect has none. Everything it needs is in
the plan, which is small enough to sit in the prompt and has already been
grounded against the brief. The one arithmetic requirement — words against a
time budget — is checked deterministically afterwards, where the answer is
exact, rather than asked of a model mid-draft.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ...config import Settings
from ...schemas import BeatNarration, ProductionIntent, Script, TeachingPlan
from .. import tracing
from ..contracts import ProviderUsage
from .prompt import SKILLS
from .validation import repair_message, validate_script, word_count

# One draft, plus at most one targeted repair. There is no tool loop to bound.
MAX_TURNS = 2


class ScriptDraft(BaseModel):
    """What the model produces.

    Not `Script` itself: that carries `script_findings`, a free-form dict which
    strict structured outputs reject and which the model should not be authoring
    anyway. Provenance is assembled by the harness, so a script cannot claim a
    plan it never read.
    """

    rationale: str = Field(min_length=1, max_length=1200)
    beats: list[BeatNarration] = Field(min_length=1)


class OpenAIAuthor:
    identifier = f"author/{SKILLS.version}"

    def __init__(self, settings: Settings):
        from openai import AsyncOpenAI

        self.settings = settings
        self.model = settings.openai_model
        # Traced or not depending on tracing.install_openai_tracing(), which
        # patches this class in place at worker startup.
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.last_usage: ProviderUsage | None = None

    async def _draft(self, system: str, history: list) -> tuple[ScriptDraft, int, int]:
        response = await self.client.responses.parse(
            model=self.model,
            instructions=system,
            input=history,
            text_format=ScriptDraft,
        )
        if response.output_parsed is None:
            raise RuntimeError("author returned no parsed script")
        history.extend(response.output)
        usage = response.usage
        return (
            response.output_parsed,
            usage.input_tokens if usage else 0,
            usage.output_tokens if usage else 0,
        )

    async def generate(self, intent: ProductionIntent, plan: TeachingPlan) -> Script:
        # Read the owner-authored skills before spending anything: a missing or
        # placeholder skill file must fail here, not after an API call.
        system = SKILLS.system()
        instructions = SKILLS.instructions(
            narration_direction=json.dumps(
                {
                    "audience": intent.audience,
                    "depth": intent.depth,
                    "narration_style": intent.narration_style,
                },
                ensure_ascii=True,
                indent=2,
            ),
            plan=plan.model_dump_json(exclude={"plan_findings"}, indent=2),
        )

        history: list = [
            {"role": "user", "content": [{"type": "input_text", "text": instructions}]}
        ]

        with tracing.span(
            "author",
            input={
                "audience": intent.audience,
                "depth": intent.depth,
                "narration_style": intent.narration_style,
                "structure_name": plan.structure_name,
                "beats": len(plan.beats),
            },
            metadata={"skills_version": SKILLS.version, "model": self.model},
        ) as run:
            with tracing.span("draft"):
                draft, input_tokens, output_tokens = await self._draft(system, history)
            turns = 1

            violations = validate_script(draft.beats, plan)
            repair: dict = {
                "ran": False,
                "initial_violations": [item["code"] for item in violations],
            }
            if violations:
                guidance = SKILLS.reflection() or "Repair the script using the listed violations."
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
                remaining = validate_script(second.beats, plan)
                repair = {
                    "ran": True,
                    "initial_violations": [item["code"] for item in violations],
                    "remaining_violations": [item["code"] for item in remaining],
                    "input_tokens": extra_in,
                    "output_tokens": extra_out,
                }
                if remaining:
                    codes = ", ".join(item["code"] for item in remaining)
                    raise ValueError(f"author repair failed deterministic validation: {codes}")
                draft = second
                input_tokens += extra_in
                output_tokens += extra_out
                turns += 1

            words = sum(word_count(item.narration) for item in draft.beats)
            run.update(
                output={
                    "beats": len(draft.beats),
                    "words": words,
                    "repair": repair,
                }
            )

        self.last_usage = ProviderUsage(self.model, input_tokens, output_tokens, turns)

        return Script(
            **draft.model_dump(),
            script_findings={
                # Never claim more than the run actually did.
                "fixture": False,
                "model": self.model,
                "skills_version": SKILLS.version,
                "structure_name": plan.structure_name,
                "repair": repair,
                # Derived here rather than stored on the script: the count is
                # recomputed from the words themselves everywhere it is shown.
                "word_count": words,
            },
        )


def build(settings: Settings) -> OpenAIAuthor:
    if not settings.openai_api_key:
        raise ValueError("DECODE_OPENAI_API_KEY is required when DECODE_AUTHOR=openai")
    return OpenAIAuthor(settings)
