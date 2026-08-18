"""The shared runtime for the model-backed generative agents.

Every generative department was carrying a byte-identical `__init__` and
`_draft` — the harness docs/AGENT-GRAPH.md §4 calls the part every agent shares (the
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


class ModelAgent:
    """Client + one structured draft call. Subclasses set `identifier`."""

    identifier: str

    def __init__(self, settings: Settings):
        from openai import AsyncOpenAI

        self.settings = settings
        self.model = settings.openai_model
        # Tracing patches `openai.AsyncOpenAI` in place (see tracing.py), so
        # constructing it here is the entire hook — no per-class patching.
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key, base_url=settings.openai_base_url
        )
        self.last_usage: ProviderUsage | None = None

    async def _draft(
        self, system: str, history: list, text_format: type[DraftT]
    ) -> tuple[DraftT, int, int]:
        from ..execution import streaming

        ctx = streaming.current()
        if ctx is not None:
            streamed = await self._draft_streaming(system, history, text_format, ctx)
            if streamed is not None:
                return streamed
            # streaming/reasoning wasn't available — fall through to a normal draft.

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

    async def _draft_streaming(
        self, system: str, history: list, text_format: type[DraftT], ctx: dict
    ) -> tuple[DraftT, int, int] | None:
        """The same structured draft, but the model's reasoning summary is streamed
        live to the chat as it arrives. Returns the parsed result like `_draft`, or
        `None` when reasoning streaming isn't available so the caller falls back to
        a normal draft. Best-effort: never changes the result."""
        from ..execution import streaming

        url = self.settings.redis_url
        await streaming.begin(url, ctx)
        final = await streaming.stream_call(
            self.client, url, ctx,
            model=self.model,
            instructions=system,
            input=history,
            text_format=text_format,
        )
        await streaming.end(url, ctx)
        if final is None:
            return None
        if final.output_parsed is None:
            raise RuntimeError(f"{self.identifier} returned no parsed output")
        history.extend(final.output)
        usage = final.usage
        return (
            final.output_parsed,
            usage.input_tokens if usage else 0,
            usage.output_tokens if usage else 0,
        )
