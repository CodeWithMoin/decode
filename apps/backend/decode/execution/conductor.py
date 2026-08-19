"""The production conductor — the model that decides what runs next.

AGENT-GRAPH §1: the hardcoded CHAIN gives way to a decision from the goal and
the current project state. §10 keeps the split strict: the system computes
which steps are *ready* (dependencies stay deterministic — an LLM owning
staleness would break the only-regenerate-downstream guarantee), and the model
chooses among ready steps. With one candidate there is no decision, so no
model call; with none the production is complete.

The choice can never break the build: an invalid or failed decision falls back
to the classic chain order, and the caller re-validates inputs deterministically
either way.
"""

from __future__ import annotations

import asyncio
import json

from pydantic import BaseModel

from ..config import Settings

# The classic order, kept as the deterministic fallback preference — not the
# decider. When the model is unavailable or answers nonsense, the production
# still proceeds the way it always did.
FALLBACK_ORDER = [
    "generate_teaching_plan",
    "generate_script",
    "generate_scene_visuals",
    "generate_voice",
]

# Creator-language names, used in the prompt and in deterministic reasons so
# internal job kinds never reach the chat.
STAGE_LABEL = {
    "generate_production_brief": "reading the topic into a brief",
    "generate_teaching_plan": "planning the lesson",
    "generate_script": "writing the narration",
    "generate_scene_visuals": "animating the scenes",
    "generate_voice": "recording the voiceover",
}

_DECISION_TIMEOUT_SECONDS = 15


class _Choice(BaseModel):
    next_kind: str
    # One sentence, creator language — shown in the chat as why this step is next.
    reason: str


def _fallback(candidates: list[str]) -> tuple[str, str]:
    kind = next((k for k in FALLBACK_ORDER if k in candidates), candidates[0])
    return kind, f"Next up: {STAGE_LABEL.get(kind, kind)}."


async def choose_next(
    settings: Settings,
    finished_kind: str,
    candidates: list[str],
    state: dict,
) -> tuple[str, str]:
    """Pick the next stage from the ready candidates, with the reason why.

    `state` is small creator-relevant context (what exists, the audience and
    length from the intent) so the model can order work sensibly — e.g. animate
    the scenes before recording the voiceover, because narration timing feeds
    the cut.
    """
    if len(candidates) == 1:
        kind = candidates[0]
        return kind, f"Next up: {STAGE_LABEL.get(kind, kind)} — the one step that’s ready."
    if settings.conductor == "chain" or not settings.openai_api_key:
        return _fallback(candidates)

    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
    labelled = [{"kind": k, "step": STAGE_LABEL.get(k, k)} for k in candidates]
    try:
        async with asyncio.timeout(_DECISION_TIMEOUT_SECONDS):
            response = await client.responses.parse(
                model=settings.orchestrator_model,
                instructions=(
                    "You conduct an automated video production. One step just finished; "
                    "several are ready. Choose the single best next step and say why in "
                    "one short sentence a creator understands — name steps by their "
                    "plain-language name, never an internal kind. Consider: narration "
                    "timing drives the cut, so scene animation usually precedes the "
                    "voiceover recording; the goal is a finished video that teaches. "
                    "Return next_kind as one of the candidate kinds, exactly."
                ),
                input=json.dumps(
                    {
                        "finished": STAGE_LABEL.get(finished_kind, finished_kind),
                        "candidates": labelled,
                        "project": state,
                    },
                    ensure_ascii=True,
                ),
                text_format=_Choice,
            )
        choice = response.output_parsed
        if choice is not None and choice.next_kind in candidates and choice.reason.strip():
            return choice.next_kind, choice.reason.strip()
    except Exception:
        pass  # any failure means the classic order, never a stalled build
    return _fallback(candidates)
