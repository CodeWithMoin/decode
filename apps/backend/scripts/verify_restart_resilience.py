"""Prove the two properties the outbox and job/run machinery exist to provide.

1. At-least-once delivery publishes exactly one logical output. A worker that
   crashes after committing its work will have its job redelivered; replaying it
   must not produce a second Production Brief version.
2. PostgreSQL is canonical. Losing every key in Redis must not lose a project,
   job, artifact, evaluation, approval or usage fact, and the system must accept
   new work afterwards.

Run inside a deployed container — the database is private to Railway's network.
Requires httpx, which is a dev dependency (see DEPLOY.md).
"""

import asyncio

from arq.connections import RedisSettings, create_pool
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from decode.config import get_settings
from decode.db import SessionLocal, new_id
from decode.execution.dispatcher import dispatch_once
from decode.execution.worker import execute_run
from decode.main import app
from decode.models import Artifact, ArtifactVersion, Run

INTENT = {
    "creative_brief": "Teach feedback loops",
    "audience": "Curious beginners",
    "target_duration_seconds": 180,
    "runtime_mode": "fixed",
    "depth": "balanced",
    "narration_style": "friendly",
    "brand": {"colors": [], "fonts": None, "guidelines": None},
}


async def brief_version_count(project_id: str) -> int:
    async with SessionLocal() as session:
        return await session.scalar(
            select(func.count(ArtifactVersion.id))
            .join(Artifact, Artifact.id == ArtifactVersion.artifact_id)
            .where(
                Artifact.project_id == project_id,
                Artifact.artifact_type == "production_brief",
            )
        )


async def latest_run_id(job_id: str) -> str:
    async with SessionLocal() as session:
        return await session.scalar(
            select(Run.id).where(Run.job_id == job_id).order_by(Run.attempt.desc()).limit(1)
        )


async def run_generation(client: AsyncClient) -> tuple[str, str]:
    """Drive one project from creation to a succeeded generation job."""
    nonce = new_id()
    project = await client.post(
        "/api/v1/projects",
        json={"title": "Restart resilience"},
        headers={"Idempotency-Key": f"project-{nonce}"},
    )
    assert project.status_code == 201, project.text
    project_id = project.json()["project_id"]

    source = await client.post(
        f"/api/v1/projects/{project_id}/sources",
        files={"file": ("source.txt", b"A feedback loop changes its input.", "text/plain")},
        data={"source_kind": "text"},
        headers={"Idempotency-Key": f"source-{nonce}"},
    )
    assert source.status_code == 201, source.text

    intent = await client.post(
        f"/api/v1/projects/{project_id}/production-intent/versions",
        json=INTENT,
        headers={"Idempotency-Key": f"intent-{nonce}"},
    )
    assert intent.status_code == 201, intent.text

    generation = await client.post(
        f"/api/v1/projects/{project_id}/production-brief/generations",
        json={
            "source_version_ids": [source.json()["source_version_id"]],
            "intent_version_id": intent.json()["version_id"],
        },
        headers={"Idempotency-Key": f"generation-{nonce}"},
    )
    assert generation.status_code == 202, generation.text
    job_id = generation.json()["job_id"]

    dispatch_redis = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
    try:
        assert await dispatch_once(dispatch_redis) == 1
    finally:
        await dispatch_redis.aclose()
    for _ in range(100):
        job = await client.get(f"/api/v1/projects/{project_id}/jobs/{job_id}")
        assert job.status_code == 200, job.text
        if job.json()["status"] == "succeeded":
            break
        await asyncio.sleep(0.2)
    else:
        raise AssertionError(f"worker did not finish job: {job.text}")

    return project_id, job_id


async def check_duplicate_delivery(client: AsyncClient) -> str:
    project_id, job_id = await run_generation(client)

    before = await brief_version_count(project_id)
    assert before == 1, f"expected one brief version, found {before}"

    # Exactly what ARQ does when a worker dies after committing but before the
    # job is acknowledged: the same run is delivered again.
    run_id = await latest_run_id(job_id)
    replay = await execute_run(None, run_id)
    assert replay["status"] == "already_succeeded", f"unexpected replay result: {replay}"

    after = await brief_version_count(project_id)
    assert after == before, f"redelivery published a duplicate: {before} -> {after}"

    print(f"  replayed run {run_id[:8]}… -> {replay['status']}, versions still {after}")
    print("duplicate_delivery=passed")
    return project_id


async def check_redis_loss(client: AsyncClient, project_id: str) -> None:
    brief_before = (await client.get(f"/api/v1/projects/{project_id}/production-brief")).json()

    redis = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
    try:
        await redis.flushall()
        print("  flushed every key in Redis")
    finally:
        await redis.aclose()

    # Everything canonical must still answer from PostgreSQL alone.
    studio = await client.get(f"/api/v1/projects/{project_id}/studio")
    assert studio.status_code == 200, studio.text

    brief_after = await client.get(f"/api/v1/projects/{project_id}/production-brief")
    assert brief_after.status_code == 200, brief_after.text
    assert brief_after.json()["latest_version_id"] == brief_before["latest_version_id"]

    artifact_id = brief_after.json()["artifact_id"]
    history = await client.get(f"/api/v1/projects/{project_id}/artifacts/{artifact_id}/versions")
    assert history.status_code == 200, history.text
    assert len(history.json()["items"]) >= 1

    print("  studio, brief, and history all still answer after Redis loss")

    # And the system must accept new work rather than needing a manual repair.
    await run_generation(client)
    print("  a new generation completed after the flush")
    print("redis_loss=passed")


async def verify() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        project_id = await check_duplicate_delivery(client)
        await check_redis_loss(client, project_id)
    print("restart_resilience=passed")


if __name__ == "__main__":
    asyncio.run(verify())
