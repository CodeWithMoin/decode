"""Exercise the walking skeleton through PostgreSQL, outbox, Redis, and ARQ."""

import asyncio

from arq import create_pool
from arq.connections import RedisSettings
from httpx import ASGITransport, AsyncClient

from decode.config import get_settings
from decode.db import new_id
from decode.execution.dispatcher import dispatch_once
from decode.main import app

INTENT = {
    "creative_brief": "Teach feedback loops",
    "audience": "Curious beginners",
    "target_duration_seconds": 180,
    "runtime_mode": "fixed",
    "depth": "balanced",
    "narration_style": "friendly",
    "brand": {"colors": [], "fonts": None, "guidelines": None},
}


async def verify() -> None:
    nonce = new_id()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        project_response = await client.post(
            "/api/v1/projects",
            json={"title": "Worker verification"},
            headers={"Idempotency-Key": f"project-{nonce}"},
        )
        assert project_response.status_code == 201, project_response.text
        project_id = project_response.json()["project_id"]
        source_response = await client.post(
            f"/api/v1/projects/{project_id}/sources",
            files={"file": ("source.txt", b"A feedback loop changes its input.", "text/plain")},
            data={"source_kind": "text"},
            headers={"Idempotency-Key": f"source-{nonce}"},
        )
        assert source_response.status_code == 201, source_response.text
        intent_response = await client.post(
            f"/api/v1/projects/{project_id}/production-intent/versions",
            json=INTENT,
            headers={"Idempotency-Key": f"intent-{nonce}"},
        )
        assert intent_response.status_code == 201, intent_response.text
        generation_response = await client.post(
            f"/api/v1/projects/{project_id}/production-brief/generations",
            json={
                "source_version_ids": [source_response.json()["source_version_id"]],
                "intent_version_id": intent_response.json()["version_id"],
            },
            headers={"Idempotency-Key": f"generation-{nonce}"},
        )
        assert generation_response.status_code == 202, generation_response.text
        job_id = generation_response.json()["job_id"]
        redis = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
        try:
            assert await dispatch_once(redis) == 1
        finally:
            await redis.aclose()
        for _ in range(300):
            job_response = await client.get(f"/api/v1/projects/{project_id}/jobs/{job_id}")
            assert job_response.status_code == 200, job_response.text
            if job_response.json()["status"] == "succeeded":
                break
            await asyncio.sleep(0.1)
        else:
            raise AssertionError(f"worker did not finish job: {job_response.text}")
        brief_response = await client.get(f"/api/v1/projects/{project_id}/production-brief")
        assert brief_response.status_code == 200, brief_response.text
        assert brief_response.json()["latest_version"]["owner_role"] == "producer"
        usage_response = await client.get(f"/api/v1/projects/{project_id}/jobs/{job_id}/usage")
        assert usage_response.status_code == 200, usage_response.text
        assert len(usage_response.json()["items"]) == 2

        # The project chains by default, so finishing the brief approved it and
        # queued the plan — through the same outbox, so the dispatcher has a
        # second row to move. This is the part unit tests cannot see: they stop
        # at the outbox row rather than following it back out to a worker.
        assert brief_response.json()["approved_version_id"] is not None
        redis = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
        try:
            assert await dispatch_once(redis) == 1
        finally:
            await redis.aclose()
        for _ in range(300):
            studio_response = await client.get(f"/api/v1/projects/{project_id}/studio")
            assert studio_response.status_code == 200, studio_response.text
            if studio_response.json()["current_stage"] == "teaching_plan":
                break
            await asyncio.sleep(0.1)
        else:
            raise AssertionError(f"chained plan did not finish: {studio_response.text}")

        # And on to the script. Every link in the chain goes through the outbox,
        # so each one is a separate row for the dispatcher to move.
        redis = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
        try:
            assert await dispatch_once(redis) == 1
        finally:
            await redis.aclose()
        for _ in range(300):
            studio_response = await client.get(f"/api/v1/projects/{project_id}/studio")
            assert studio_response.status_code == 200, studio_response.text
            if studio_response.json()["current_stage"] == "script":
                break
            await asyncio.sleep(0.1)
        else:
            raise AssertionError(f"chained script did not finish: {studio_response.text}")
    print("postgres_redis_arq_walking_skeleton=passed")


if __name__ == "__main__":
    asyncio.run(verify())
