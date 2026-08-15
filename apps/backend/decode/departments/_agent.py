"""The shared runtime for the OpenAI-backed generative departments.

Every generative department was carrying a byte-identical `__init__` and
`_draft` — the harness AGENT-GRAPH.md §4 calls the part every agent shares (the
client and one structured-output draft call). It lives here once so the three
departments keep only what actually differs: their prompt assembly and their
draft→validate→repair policy.

The evaluator does not subclass this: it reads a different model setting and
never repairs, so sharing would be a worse fit than the few lines it saves.
"""

from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel

from ..config import Settings
from .contracts import ProviderUsage

DraftT = TypeVar("DraftT", bound=BaseModel)


class OpenAIAgent:
    """Client + one structured draft call. Subclasses set `identifier`."""

    identifier: str

    def __init__(self, settings: Settings):
        from openai import AsyncOpenAI

        self.settings = settings
        self.model = settings.openai_model
        # Tracing patches `openai.AsyncOpenAI` in place (see tracing.py), so
        # constructing it here is the entire hook — no per-class patching.
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.last_usage: ProviderUsage | None = None

    async def _draft(
        self, system: str, history: list, text_format: type[DraftT]
    ) -> tuple[DraftT, int, int]:
        response = await self.client.responses.parse(
            model=self.model,
            instructions=system,
            input=history,
            text_format=text_format,
        )
        if response.output_parsed is None:
            raise RuntimeError(f"{self.identifier} returned no parsed output")
        history.extend(response.output)
        usage = response.usage
        return (
            response.output_parsed,
            usage.input_tokens if usage else 0,
            usage.output_tokens if usage else 0,
        )
