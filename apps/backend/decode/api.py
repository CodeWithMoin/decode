from collections.abc import AsyncIterator
from uuid import uuid4

from fastapi import Header, Request

from .config import get_settings
from .problems import AppProblem


def actor_id() -> str:
    return get_settings().actor_id


def idempotency_key(value: str | None = Header(default=None, alias="Idempotency-Key")) -> str:
    if not value or len(value) > 200:
        raise AppProblem(400, "invalid_command", "A valid Idempotency-Key header is required.")
    return value


async def request_context(request: Request, call_next):
    request.state.request_id = request.headers.get("X-Request-ID") or str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


async def upload_chunks(file, size: int = 1024 * 1024) -> AsyncIterator[bytes]:
    while chunk := await file.read(size):
        yield chunk
