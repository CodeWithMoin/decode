import os
from pathlib import Path

os.environ["DECODE_DATABASE_URL"] = "sqlite+aiosqlite:////tmp/decode_backend_tests.db"
os.environ["DECODE_LOCAL_OBJECT_ROOT"] = "/tmp/decode_backend_objects"

# The suite must never reach a paid provider. A developer .env carrying
# DECODE_INTAKE=openai would otherwise bill every `make test`, make the suite
# depend on the network, and turn a fixture assertion into a live generation.
# Env vars outrank .env in pydantic-settings, so this holds for every Settings()
# the tests construct, not just the cached one.
os.environ["DECODE_INTAKE"] = "fake"
os.environ["DECODE_ARCHITECT"] = "fake"
os.environ["DECODE_AUTHOR"] = "fake"
os.environ["DECODE_VISUAL_DIRECTOR"] = "fake"
os.environ["DECODE_VISUALIZER"] = "fake"
os.environ["DECODE_EVALUATOR"] = "fake"
os.environ["DECODE_ORCHESTRATOR"] = "fake"
# A developer .env now carries real Fish Audio credentials. Null them so the
# suite is deterministic — the fish_audio tests pass their own explicit keys,
# and the "missing credentials raises" guard must see genuinely absent ones.
os.environ["DECODE_VOICE"] = "fake"
os.environ["DECODE_FISH_AUDIO_API_KEY"] = ""
os.environ["DECODE_FISH_AUDIO_REFERENCE_ID"] = ""

# Same reasoning for tracing: a developer .env with real Langfuse keys would ship
# test runs to the trace store and make "tracing is off by default" pass or fail
# depending on whose machine ran it.
os.environ["DECODE_LANGFUSE_PUBLIC_KEY"] = ""
os.environ["DECODE_LANGFUSE_SECRET_KEY"] = ""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from decode.db import Base, engine
from decode.main import app


@pytest_asyncio.fixture(autouse=True)
async def clean_database():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield
    for path in Path("/tmp/decode_backend_objects").glob("**/*"):
        if path.is_file():
            path.unlink()


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as value:
        yield value
