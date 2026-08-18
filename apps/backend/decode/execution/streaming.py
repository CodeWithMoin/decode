"""Live token streaming from agents to the chat — a best-effort side channel.

The durable pipeline is unchanged: stages still publish `ProjectEvent` rows at
commit, and the SSE endpoint still polls them. This adds an *ephemeral* overlay so
the chat can show an agent's output as it is generated ("thinking out loud")
instead of one canned line per finished stage.

Why a separate channel: `ProjectEvent` rows only become visible when the worker
commits its job transaction (the very end of a stage), so they can never be
mid-stage live. Tokens are therefore published to a Redis pub/sub channel
(`project:{id}:stream`) that the SSE endpoint subscribes to, and never touch the
database — they are decoration, not a record.

The current stage is carried in a `ContextVar` set by the worker, so the deep
agent call sites (`ModelAgent._draft`) can decide to stream without every function
signature having to thread a publisher through.
"""

from __future__ import annotations

import contextvars
import json
from typing import Any

# The stage currently generating, or None. Set by the worker around a run.
_stream_ctx: contextvars.ContextVar[dict | None] = contextvars.ContextVar(
    "decode_stream_ctx", default=None
)


def current() -> dict | None:
    """The active stream context ({project_id, run_id, stage}) or None."""
    return _stream_ctx.get()


def enter(project_id: str, run_id: str, stage: str) -> contextvars.Token:
    return _stream_ctx.set({"project_id": project_id, "run_id": run_id, "stage": stage})


def leave(token: contextvars.Token) -> None:
    _stream_ctx.reset(token)


# One Redis connection per process, created lazily. Reused across publishes.
_redis: Any = None


def _get_redis(redis_url: str) -> Any:
    global _redis
    if _redis is None:
        from redis.asyncio import Redis

        _redis = Redis.from_url(redis_url)
    return _redis


async def publish(redis_url: str, project_id: str, payload: dict) -> None:
    """Publish one live frame. Best-effort: a Redis failure is swallowed, because
    a broken decoration must never fail a real generation."""
    try:
        await _get_redis(redis_url).publish(
            f"project:{project_id}:stream", json.dumps(payload)
        )
    except Exception:
        pass


def channel(project_id: str) -> str:
    return f"project:{project_id}:stream"


async def begin(redis_url: str, ctx: dict) -> None:
    await publish(
        redis_url, ctx["project_id"],
        {"type": "agent.stream.begin", "run_id": ctx["run_id"], "stage": ctx["stage"]},
    )


async def end(redis_url: str, ctx: dict) -> None:
    await publish(
        redis_url, ctx["project_id"],
        {"type": "agent.stream.end", "run_id": ctx["run_id"], "stage": ctx["stage"]},
    )


async def stream_call(client: Any, redis_url: str, ctx: dict, **kwargs: Any) -> Any:
    """Open a streaming Responses call and publish the model's **reasoning
    summary** (its thinking, in prose) live to the chat as it arrives — never the
    raw JSON output. Returns the final response (same interface as
    `responses.parse`), or None if streaming/reasoning isn't available so the
    caller can fall back to a normal call. Best-effort: deltas are coalesced and
    any failure just returns None.
    """
    pid, rid, stage = ctx["project_id"], ctx["run_id"], ctx["stage"]
    buffer: list[str] = []
    pending = 0

    async def flush() -> None:
        nonlocal pending
        if buffer:
            await publish(
                redis_url, pid,
                {"type": "agent.token", "run_id": rid, "stage": stage,
                 "delta": "".join(buffer)},
            )
            buffer.clear()
            pending = 0

    try:
        async with client.responses.stream(reasoning={"summary": "auto"}, **kwargs) as stream:
            async for event in stream:
                if getattr(event, "type", None) == "response.reasoning_summary_text.delta":
                    buffer.append(event.delta)
                    pending += len(event.delta)
                    if pending >= 48:  # coalesce so we don't publish per token
                        await flush()
            await flush()
            return await stream.get_final_response()
    except Exception:
        return None
