import asyncio
import hashlib
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select

from decode.db import SessionLocal, new_id, utcnow
from decode.domain import canonical_hash
from decode.execution.worker import execute_run
from decode.models import ArtifactVersion, Job, Project, ProjectEvent, Run, Source
from decode.projects import router as projects_router

HEADERS = {"Idempotency-Key": "key"}
INTENT = {
    "creative_brief": "Teach feedback loops",
    "audience": "Curious beginners",
    "target_duration_seconds": 180,
    "runtime_mode": "fixed",
    "depth": "balanced",
    "narration_style": "friendly",
    "brand": {"colors": [], "fonts": None, "guidelines": None},
}


async def create_inputs(client):
    project = (
        await client.post(
            "/api/v1/projects", json={"title": "Feedback"}, headers={"Idempotency-Key": "project"}
        )
    ).json()
    source = (
        await client.post(
            f"/api/v1/projects/{project['project_id']}/sources",
            files={"file": ("notes.txt", b"A feedback loop changes its own input.", "text/plain")},
            data={"source_kind": "text"},
            headers={"Idempotency-Key": "source"},
        )
    ).json()
    intent = (
        await client.post(
            f"/api/v1/projects/{project['project_id']}/production-intent/versions",
            json=INTENT,
            headers={"Idempotency-Key": "intent"},
        )
    ).json()
    return project, source, intent


@pytest.mark.asyncio
async def test_complete_generation_edit_approval_history_lineage_and_usage(client):
    project, source, intent = await create_inputs(client)
    pid = project["project_id"]
    generation = await client.post(
        f"/api/v1/projects/{pid}/production-brief/generations",
        json={
            "source_version_ids": [source["source_version_id"]],
            "intent_version_id": intent["version_id"],
        },
        headers={"Idempotency-Key": "generation"},
    )
    assert generation.status_code == 202
    queued = generation.json()
    async with SessionLocal() as session:
        run = await session.get(Run, queued["run_id"])
        assert run.context_hash
        assert set(run.context_manifest) == {
            "source_version_ids",
            "intent_version_id",
            "schema",
        }
    result = await execute_run(None, queued["run_id"])
    assert result["status"] == "succeeded"
    duplicate = await execute_run(None, queued["run_id"])
    assert duplicate["status"] == "already_succeeded"
    async with SessionLocal() as session:
        assert (
            await session.scalar(
                select(func.count(ArtifactVersion.id)).where(
                    ArtifactVersion.run_id == queued["run_id"]
                )
            )
            == 1
        )

    job = (await client.get(f"/api/v1/projects/{pid}/jobs/{queued['job_id']}")).json()
    assert job["status"] == "succeeded"
    brief = (await client.get(f"/api/v1/projects/{pid}/production-brief")).json()
    assert brief["latest_evaluation"]["decision"] == "pass"
    assert brief["latest_version"]["payload"]["source_findings"]["fixture"] is True
    artifact_id, generated_id = brief["artifact_id"], brief["latest_version_id"]

    approval = await client.post(
        f"/api/v1/projects/{pid}/artifacts/{artifact_id}/versions/{generated_id}/approvals",
        json={"decision": "approved", "note": "Looks good"},
        headers={"Idempotency-Key": "approve-1"},
    )
    assert approval.status_code == 201
    payload = brief["latest_version"]["payload"]
    payload["summary"] = "Human-edited summary."
    edit = await client.post(
        f"/api/v1/projects/{pid}/artifacts/{artifact_id}/versions",
        json={"base_version_id": generated_id, "schema_version": 1, "payload": payload},
        headers={"Idempotency-Key": "edit-1"},
    )
    assert edit.status_code == 201
    edited = edit.json()
    assert edited["version_id"] != generated_id
    assert edited["approved_version_id"] == generated_id
    conflict = await client.post(
        f"/api/v1/projects/{pid}/artifacts/{artifact_id}/versions",
        json={"base_version_id": generated_id, "schema_version": 1, "payload": payload},
        headers={"Idempotency-Key": "edit-stale"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["current_latest_version_id"] == edited["version_id"]

    edit_lineage = (
        await client.get(
            f"/api/v1/projects/{pid}/artifacts/{artifact_id}/versions/{edited['version_id']}/lineage"
        )
    ).json()
    assert any(
        parent["version_id"] == generated_id and parent["role"] == "supersedes"
        for parent in edit_lineage["parents"]
    )

    history = (await client.get(f"/api/v1/projects/{pid}/artifacts/{artifact_id}/versions")).json()
    assert len(history["items"]) == 2
    assert history["items"][0]["payload"]["summary"] == "Human-edited summary."
    lineage = (
        await client.get(
            f"/api/v1/projects/{pid}/artifacts/{artifact_id}/versions/{generated_id}/lineage"
        )
    ).json()
    assert {parent["artifact_type"] for parent in lineage["parents"]} == {
        "source",
        "production_intent",
    }
    usage = (await client.get(f"/api/v1/projects/{pid}/jobs/{queued['job_id']}/usage")).json()
    assert {item["operation"] for item in usage["items"]} == {
        "production_brief_generation",
        "production_brief_evaluation",
    }
    assert all(item["estimated_cost_usd"] == "0.000000" for item in usage["items"])


@pytest.mark.asyncio
async def test_transactional_job_idempotency_and_durable_event_replay(client):
    project, source, intent = await create_inputs(client)
    pid = project["project_id"]
    body = {
        "source_version_ids": [source["source_version_id"]],
        "intent_version_id": intent["version_id"],
    }
    first = await client.post(
        f"/api/v1/projects/{pid}/production-brief/generations",
        json=body,
        headers={"Idempotency-Key": "same-generation"},
    )
    replay = await client.post(
        f"/api/v1/projects/{pid}/production-brief/generations",
        json=body,
        headers={"Idempotency-Key": "same-generation"},
    )
    assert first.json() == replay.json()
    async with SessionLocal() as session:
        assert await session.scalar(select(func.count(Job.id))) == 1
        events = list(
            (
                await session.scalars(
                    select(ProjectEvent)
                    .where(ProjectEvent.project_id == pid)
                    .order_by(ProjectEvent.id)
                )
            ).all()
        )
        last_seen = events[0].id
    await execute_run(None, first.json()["run_id"])
    async with SessionLocal() as session:
        replayed = list(
            (
                await session.scalars(
                    select(ProjectEvent)
                    .where(ProjectEvent.project_id == pid, ProjectEvent.id > last_seen)
                    .order_by(ProjectEvent.id)
                )
            ).all()
        )
    assert replayed[0].id > last_seen
    assert replayed[-1].type == "job.succeeded"


@pytest.mark.asyncio
async def test_problem_shape_and_idempotency_conflict(client):
    first = await client.post("/api/v1/projects", json={"title": "One"}, headers=HEADERS)
    assert first.status_code == 201
    conflict = await client.post("/api/v1/projects", json={"title": "Two"}, headers=HEADERS)
    assert conflict.status_code == 409
    body = conflict.json()
    assert body["code"] == "idempotency_conflict"
    assert body["request_id"]
    assert body["retryable"] is False


@pytest.mark.asyncio
async def test_staged_source_is_cleaned_on_replay_and_content_conflict(client):
    project = (
        await client.post(
            "/api/v1/projects",
            json={"title": "Cleanup"},
            headers={"Idempotency-Key": "cleanup-project"},
        )
    ).json()
    route = f"/api/v1/projects/{project['project_id']}/sources"

    async def upload(content: bytes):
        return await client.post(
            route,
            files={"file": ("notes.txt", content, "text/plain")},
            data={"source_kind": "text"},
            headers={"Idempotency-Key": "cleanup-source"},
        )

    first = await upload(b"same bytes")
    assert first.status_code == 201
    assert len(list(Path("/tmp/decode_backend_objects").glob("**/notes.txt"))) == 1
    async with SessionLocal() as session:
        staged = await session.scalar(
            select(Source).where(Source.project_id == project["project_id"])
        )
        assert staged.status == "ready"
        assert staged.object_key
        assert staged.artifact_id and staged.version_id and staged.byte_hash
    replay = await upload(b"same bytes")
    assert replay.status_code == 201
    assert replay.json() == first.json()
    assert len(list(Path("/tmp/decode_backend_objects").glob("**/notes.txt"))) == 1
    conflict = await upload(b"different bytes")
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "idempotency_conflict"
    assert len(list(Path("/tmp/decode_backend_objects").glob("**/notes.txt"))) == 1


@pytest.mark.asyncio
async def test_stale_upload_staging_resumes_with_a_new_leased_object_key(client):
    project = (
        await client.post(
            "/api/v1/projects",
            json={"title": "Resume"},
            headers={"Idempotency-Key": "resume-project"},
        )
    ).json()
    pid = project["project_id"]
    key = "resume-source"
    scope = f"attach_source:{pid}"
    actor = "internal-private-beta-user"
    command_identity = canonical_hash({"actor": actor, "scope": scope, "key": key})
    raw = {"filename": "resume.txt", "source_kind": "text", "media_type": "text/plain"}
    source_id = new_id()
    previous_object_key = f"projects/{pid}/sources/{source_id}/attempts/old-lease/resume.txt"
    previous_target = Path("/tmp/decode_backend_objects") / previous_object_key
    previous_target.parent.mkdir(parents=True, exist_ok=True)
    previous_target.write_bytes(b"orphaned completed object")
    async with SessionLocal() as session:
        session.add(
            Source(
                id=source_id,
                project_id=pid,
                artifact_id=None,
                version_id=None,
                filename="resume.txt",
                source_kind="text",
                media_type="text/plain",
                size_bytes=None,
                status="uploading",
                object_key=previous_object_key,
                upload_lease_id="old-lease",
                command_identity=command_identity,
                request_metadata_hash=canonical_hash(raw),
                updated_at=utcnow() - timedelta(hours=1),
            )
        )
        await session.commit()
    response = await client.post(
        f"/api/v1/projects/{pid}/sources",
        files={"file": ("resume.txt", b"resumed bytes", "text/plain")},
        data={"source_kind": "text"},
        headers={"Idempotency-Key": key},
    )
    assert response.status_code == 201
    assert not previous_target.exists()
    async with SessionLocal() as session:
        resumed = await session.get(Source, source_id)
        assert resumed.status == "ready"
        assert resumed.object_key != previous_object_key
        assert resumed.upload_lease_id != "old-lease"
        target = Path("/tmp/decode_backend_objects") / resumed.object_key
        assert target.read_bytes() == b"resumed bytes"


@pytest.mark.asyncio
async def test_in_progress_upload_and_changed_metadata_fail_safely(client):
    project = (
        await client.post(
            "/api/v1/projects",
            json={"title": "In progress"},
            headers={"Idempotency-Key": "progress-project"},
        )
    ).json()
    pid, key = project["project_id"], "progress-source"
    scope, actor = f"attach_source:{project['project_id']}", "internal-private-beta-user"
    command_identity = canonical_hash({"actor": actor, "scope": scope, "key": key})
    raw = {"filename": "pending.txt", "source_kind": "text", "media_type": "text/plain"}
    async with SessionLocal() as session:
        session.add(
            Source(
                project_id=pid,
                artifact_id=None,
                version_id=None,
                filename="pending.txt",
                source_kind="text",
                media_type="text/plain",
                size_bytes=None,
                status="uploading",
                object_key=f"projects/{pid}/sources/pending/pending.txt",
                command_identity=command_identity,
                request_metadata_hash=canonical_hash(raw),
                updated_at=utcnow(),
            )
        )
        await session.commit()
    progress = await client.post(
        f"/api/v1/projects/{pid}/sources",
        files={"file": ("pending.txt", b"bytes", "text/plain")},
        data={"source_kind": "text"},
        headers={"Idempotency-Key": key},
    )
    assert progress.status_code == 409
    assert progress.json()["code"] == "upload_in_progress"
    assert progress.json()["retryable"] is True
    changed = await client.post(
        f"/api/v1/projects/{pid}/sources",
        files={"file": ("changed.txt", b"bytes", "text/plain")},
        data={"source_kind": "text"},
        headers={"Idempotency-Key": key},
    )
    assert changed.status_code == 409
    assert changed.json()["code"] == "idempotency_conflict"


@pytest.mark.asyncio
async def test_stale_uploader_cannot_finalize_or_delete_new_owners_object(client, monkeypatch):
    class PausingStore:
        def __init__(self):
            self.started = asyncio.Event()
            self.release = asyncio.Event()
            self.objects: dict[str, bytes] = {}

        async def put(self, key, chunks, max_bytes):
            content = b"".join([chunk async for chunk in chunks])
            self.started.set()
            await self.release.wait()
            self.objects[key] = content
            return len(content), key, hashlib.sha256(content).hexdigest()

        async def delete(self, key):
            self.objects.pop(key, None)

    store = PausingStore()
    monkeypatch.setattr(projects_router, "object_store", lambda _settings: store)
    project = (
        await client.post(
            "/api/v1/projects",
            json={"title": "Lease ownership"},
            headers={"Idempotency-Key": "lease-project"},
        )
    ).json()
    pid = project["project_id"]
    request = asyncio.create_task(
        client.post(
            f"/api/v1/projects/{pid}/sources",
            files={"file": ("lease.txt", b"old attempt", "text/plain")},
            data={"source_kind": "text"},
            headers={"Idempotency-Key": "lease-source"},
        )
    )
    await store.started.wait()
    new_lease = new_id()
    new_key = f"projects/{pid}/sources/takeover/attempts/{new_lease}/lease.txt"
    store.objects[new_key] = b"new owner bytes"
    async with SessionLocal() as session:
        source = await session.scalar(select(Source).where(Source.project_id == pid))
        old_key = source.object_key
        source.upload_lease_id = new_lease
        source.object_key = new_key
        source.updated_at = utcnow()
        await session.commit()
    store.release.set()
    response = await request
    assert response.status_code == 409
    assert response.json()["code"] == "upload_in_progress"
    assert old_key not in store.objects
    assert store.objects[new_key] == b"new owner bytes"
    async with SessionLocal() as session:
        source = await session.scalar(select(Source).where(Source.project_id == pid))
        assert source.status == "uploading"
        assert source.upload_lease_id == new_lease
        assert source.object_key == new_key


@pytest.mark.asyncio
async def test_stale_failed_run_cannot_publish_or_corrupt_retry(client):
    project, source, intent = await create_inputs(client)
    pid = project["project_id"]
    generation = (
        await client.post(
            f"/api/v1/projects/{pid}/production-brief/generations",
            json={
                "source_version_ids": [source["source_version_id"]],
                "intent_version_id": intent["version_id"],
            },
            headers={"Idempotency-Key": "stale-generation"},
        )
    ).json()
    async with SessionLocal() as session:
        old_run = await session.get(Run, generation["run_id"])
        job = await session.get(Job, generation["job_id"])
        project_row = await session.get(Project, pid)
        old_run.status = "failed"
        old_run.failure = {"code": "fixture", "message": "failed", "retryable": True}
        job.status = "failed"
        job.failure = old_run.failure
        project_row.status = "failed"
        await session.commit()
    retry = await client.post(
        f"/api/v1/projects/{pid}/jobs/{generation['job_id']}/retries",
        json={"expected_failed_run_id": generation["run_id"]},
        headers={"Idempotency-Key": "stale-retry"},
    )
    assert retry.status_code == 202
    new_run_id = retry.json()["run_id"]
    result = await execute_run(None, generation["run_id"])
    assert result == {"status": "stale_run"}
    async with SessionLocal() as session:
        job = await session.get(Job, generation["job_id"])
        project_row = await session.get(Project, pid)
        assert job.active_run_id == new_run_id
        assert job.status == "queued"
        assert job.result_artifact_version_id is None
        assert project_row.status == "processing"
        assert (
            await session.scalar(
                select(func.count(ArtifactVersion.id)).where(
                    ArtifactVersion.run_id == generation["run_id"]
                )
            )
            == 0
        )


@pytest.mark.asyncio
async def test_distinct_retry_keys_cannot_fork_attempts(client):
    project, source, intent = await create_inputs(client)
    pid = project["project_id"]
    generation = (
        await client.post(
            f"/api/v1/projects/{pid}/production-brief/generations",
            json={
                "source_version_ids": [source["source_version_id"]],
                "intent_version_id": intent["version_id"],
            },
            headers={"Idempotency-Key": "retry-race-generation"},
        )
    ).json()
    async with SessionLocal() as session:
        run = await session.get(Run, generation["run_id"])
        job = await session.get(Job, generation["job_id"])
        run.status = "failed"
        job.status = "failed"
        await session.commit()
    route = f"/api/v1/projects/{pid}/jobs/{generation['job_id']}/retries"
    body = {"expected_failed_run_id": generation["run_id"]}
    first = await client.post(route, json=body, headers={"Idempotency-Key": "retry-a"})
    second = await client.post(route, json=body, headers={"Idempotency-Key": "retry-b"})
    assert first.status_code == 202
    assert second.status_code == 409
    async with SessionLocal() as session:
        assert (
            await session.scalar(
                select(func.count(Run.id)).where(Run.job_id == generation["job_id"])
            )
            == 2
        )


@pytest.mark.asyncio
async def test_duplicate_source_version_ids_are_rejected(client):
    project, source, intent = await create_inputs(client)
    response = await client.post(
        f"/api/v1/projects/{project['project_id']}/production-brief/generations",
        json={
            "source_version_ids": [source["source_version_id"], source["source_version_id"]],
            "intent_version_id": intent["version_id"],
        },
        headers={"Idempotency-Key": "duplicate-sources"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_failed"
