"""One shared gate on concurrent model calls across the worker process.

Every provider call routes through this semaphore, so N projects building at
once queue for slots instead of stampeding the model API into rate-limit
errors that would burn task retries. Per-project spend limits live in
`create_job` / the orchestrator endpoint; this is the process-wide backstop.
"""

from __future__ import annotations

import asyncio

from ..config import get_settings

_gate: asyncio.Semaphore | None = None


def model_call_gate() -> asyncio.Semaphore:
    # ponytail: one process-wide semaphore, lazily bound to the running loop;
    # move to a Redis token bucket if the worker ever scales past one process.
    global _gate
    if _gate is None:
        _gate = asyncio.Semaphore(get_settings().max_concurrent_model_calls)
    return _gate
