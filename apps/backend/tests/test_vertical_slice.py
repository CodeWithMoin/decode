import asyncio
import hashlib
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select

from decode.db import SessionLocal, new_id, utcnow
from decode.domain import canonical_hash
from decode.execution.graph import (
    ASSEMBLY_TASK,
    SCENE_TASK,
    VISUAL_DIRECTION_TASK,
    accept_scene_candidate,
    execute_task,
)
from decode.execution.worker import execute_run
from decode.models import (
    ApprovalDecision,
    Artifact,
    ArtifactDependency,
    ArtifactType,
    ArtifactVersion,
    Evaluation,
    Job,
    JobInput,
    OutboxEvent,
    ProductionTask,
    Project,
    ProjectEvent,
    Run,
    Source,
)
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


async def create_inputs(client, auto_continue: bool = False):
    # Chaining off by default *here*, not in the product: these tests exercise
    # the stage-by-stage path, where the creator approves each artifact. The
    # chained path has its own tests below.
    project = (
        await client.post(
            "/api/v1/projects",
            json={"title": "Feedback", "auto_continue": auto_continue},
            headers={"Idempotency-Key": "project"},
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


async def execute_visual_graph(run_id: str) -> dict:
    """Drive the same independently queued graph nodes ARQ runs in production."""
    started = await execute_run(None, run_id)
    assert started["status"] == "scheduled"
    async with SessionLocal() as session:
        direction = await session.scalar(
            select(ProductionTask).where(
                ProductionTask.run_id == run_id,
                ProductionTask.kind == VISUAL_DIRECTION_TASK,
            )
        )
        assert direction is not None
        direction_id, direction_attempt = direction.id, direction.attempt
    assert (await execute_task(None, direction_id, direction_attempt))["status"] == "succeeded"
    async with SessionLocal() as session:
        scenes = list(
            (
                await session.scalars(
                    select(ProductionTask).where(
                        ProductionTask.run_id == run_id,
                        ProductionTask.kind == SCENE_TASK,
                    )
                )
            ).all()
        )
    await asyncio.gather(*(execute_task(None, task.id, task.attempt) for task in scenes))
    async with SessionLocal() as session:
        run = await session.get(Run, run_id)
        assert run is not None
        job = await session.get(Job, run.job_id)
        assert job is not None
        refreshed = list(
            (
                await session.scalars(
                    select(ProductionTask).where(
                        ProductionTask.run_id == run_id,
                        ProductionTask.kind == SCENE_TASK,
                    )
                )
            ).all()
        )
        for task in refreshed:
            source = task.output["visuals"]["scenes"][0]["component_source"]
            await accept_scene_candidate(session, job.project_id, job.id, task.id, source)
        await session.commit()
        assembly = await session.scalar(
            select(ProductionTask).where(
                ProductionTask.run_id == run_id,
                ProductionTask.kind == ASSEMBLY_TASK,
            )
        )
        assert assembly is not None and assembly.status == "queued"
        assembly_id, attempt = assembly.id, assembly.attempt
    return await execute_task(None, assembly_id, attempt)


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
    approved_brief = (await client.get(f"/api/v1/projects/{pid}/production-brief")).json()
    # The creator clicked this one, so it must not read as automatic.
    assert approved_brief["approval"]["automatic"] is False
    assert approved_brief["approval"]["note"] == "Looks good"
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
    costs = {item["operation"]: item["estimated_cost_usd"] for item in usage["items"]}
    # The fixture producer reports no tokens, so its cost is unknown rather than
    # zero. The deterministic evaluator genuinely spends nothing, so its zero is
    # measured. The two must not serialize the same way.
    assert costs["production_brief_generation"] is None
    assert costs["production_brief_evaluation"] == "0.000000"


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


@pytest.mark.asyncio
async def test_deleted_project_disappears_from_every_read_path(client):
    project, _, _ = await create_inputs(client)
    pid = project["project_id"]

    listed = (await client.get("/api/v1/projects")).json()
    assert any(item["project_id"] == pid for item in listed["items"])

    gone = await client.delete(f"/api/v1/projects/{pid}", headers={"Idempotency-Key": "del"})
    assert gone.status_code == 200

    # The list drops it and every per-project route stops answering: the guard is
    # in project_or_404, so studio and sources go with it without being touched.
    listed = (await client.get("/api/v1/projects")).json()
    assert not any(item["project_id"] == pid for item in listed["items"])
    assert (await client.get(f"/api/v1/projects/{pid}/studio")).status_code == 404

    # Soft, so the rows the immutability trigger protects are still there.
    async with SessionLocal() as session:
        assert await session.scalar(select(func.count(Source.id)).where(Source.project_id == pid))

    # Same key replays the stored response instead of deleting twice.
    replay = await client.delete(f"/api/v1/projects/{pid}", headers={"Idempotency-Key": "del"})
    assert replay.status_code == 200 and replay.json()["project_id"] == pid


@pytest.mark.asyncio
async def test_teaching_plan_requires_an_approved_brief_and_then_publishes(client):
    project, source, intent = await create_inputs(client)
    pid = project["project_id"]
    queued = (
        await client.post(
            f"/api/v1/projects/{pid}/production-brief/generations",
            json={
                "source_version_ids": [source["source_version_id"]],
                "intent_version_id": intent["version_id"],
            },
            headers={"Idempotency-Key": "generation"},
        )
    ).json()
    await execute_run(None, queued["run_id"])
    brief = (await client.get(f"/api/v1/projects/{pid}/production-brief")).json()
    artifact_id, brief_version = brief["artifact_id"], brief["latest_version_id"]

    # Nothing is approved yet, so the Director has nothing authorised to shape.
    refused = await client.post(
        f"/api/v1/projects/{pid}/teaching-plan/generations",
        json={"brief_version_id": brief_version, "intent_version_id": intent["version_id"]},
        headers={"Idempotency-Key": "plan-early"},
    )
    assert refused.status_code == 409
    assert refused.json()["code"] == "brief_not_approved"

    await client.post(
        f"/api/v1/projects/{pid}/artifacts/{artifact_id}/versions/{brief_version}/approvals",
        json={"decision": "approved", "note": None},
        headers={"Idempotency-Key": "approve-brief"},
    )

    # An edit makes latest move while approved stays put; planning against the
    # unapproved draft has to be refused by version, not just by existence.
    payload = brief["latest_version"]["payload"]
    payload["summary"] = "Edited after approval."
    edited = (
        await client.post(
            f"/api/v1/projects/{pid}/artifacts/{artifact_id}/versions",
            json={"base_version_id": brief_version, "schema_version": 1, "payload": payload},
            headers={"Idempotency-Key": "edit-after-approval"},
        )
    ).json()
    stale = await client.post(
        f"/api/v1/projects/{pid}/teaching-plan/generations",
        json={"brief_version_id": edited["version_id"], "intent_version_id": intent["version_id"]},
        headers={"Idempotency-Key": "plan-unapproved"},
    )
    assert stale.status_code == 409
    assert stale.json()["approved_version_id"] == brief_version

    later_intent = (
        await client.post(
            f"/api/v1/projects/{pid}/production-intent/versions",
            json={**INTENT, "creative_brief": "A different direction"},
            headers={"Idempotency-Key": "later-intent"},
        )
    ).json()
    mismatched_context = await client.post(
        f"/api/v1/projects/{pid}/teaching-plan/generations",
        json={
            "brief_version_id": brief_version,
            "intent_version_id": later_intent["version_id"],
        },
        headers={"Idempotency-Key": "plan-wrong-intent"},
    )
    assert mismatched_context.status_code == 409
    assert mismatched_context.json()["approved_intent_version_id"] == intent["version_id"]

    plan_job = await client.post(
        f"/api/v1/projects/{pid}/teaching-plan/generations",
        json={"brief_version_id": brief_version, "intent_version_id": intent["version_id"]},
        headers={"Idempotency-Key": "plan"},
    )
    assert plan_job.status_code == 202
    assert plan_job.json()["kind"] == "generate_teaching_plan"
    assert (await execute_run(None, plan_job.json()["run_id"]))["status"] == "succeeded"

    async with SessionLocal() as session:
        artifact = await session.scalar(
            select(Artifact).where(
                Artifact.project_id == pid,
                Artifact.artifact_type == ArtifactType.TEACHING_PLAN,
            )
        )
        assert artifact is not None
        version = await session.get(ArtifactVersion, artifact.latest_version_id)
        assert version is not None
        # The Director owns this handoff, and the beats must spend exactly the
        # runtime the creator asked for.
        assert version.owner_role == "director"
        assert version.schema_version == 2
        assert version.payload["structure_name"]
        assert version.payload["sections"]
        beats = version.payload["beats"]
        assert sum(b["target_duration_seconds"] for b in beats) == INTENT["target_duration_seconds"]
        assert all(b["key_points"] and b["brief_support"] for b in beats)

        evaluation = await session.scalar(
            select(Evaluation).where(Evaluation.artifact_version_id == version.id)
        )
        assert evaluation is not None
        assert evaluation.decision == "pass"

        # Lineage binds the approved brief, not the later edit.
        parents = list(
            (
                await session.scalars(
                    select(ArtifactDependency).where(
                        ArtifactDependency.child_version_id == version.id
                    )
                )
            ).all()
        )
        assert brief_version in {p.parent_version_id for p in parents}
        assert edited["version_id"] not in {p.parent_version_id for p in parents}

    usage = (
        await client.get(f"/api/v1/projects/{pid}/jobs/{plan_job.json()['job_id']}/usage")
    ).json()
    assert {item["operation"] for item in usage["items"]} == {
        "teaching_plan_generation",
        "teaching_plan_evaluation",
    }

    plan_history = (
        await client.get(f"/api/v1/projects/{pid}/artifacts/{artifact.id}/versions")
    ).json()
    assert plan_history["items"][0]["latest_evaluation"]["decision"] == "pass"

    studio = (await client.get(f"/api/v1/projects/{pid}/studio")).json()
    assert studio["current_stage"] == "teaching_plan"
    assert studio["most_recent_job"]["kind"] == "generate_teaching_plan"
    assert studio["allowed_actions"]["can_approve_plan"] is True


@pytest.mark.asyncio
async def test_a_chaining_project_starts_the_next_stage_itself(client):
    """One request reaches a Teaching Plan, and says who approved the brief.

    The artifacts stay separate — the plan is still its own versioned artifact
    with its own approval — but the creator does not have to stand between them.
    """
    project, source, intent = await create_inputs(client, auto_continue=True)
    pid = project["project_id"]
    queued = (
        await client.post(
            f"/api/v1/projects/{pid}/production-brief/generations",
            json={
                "source_version_ids": [source["source_version_id"]],
                "intent_version_id": intent["version_id"],
            },
            headers={"Idempotency-Key": "generation"},
        )
    ).json()
    await execute_run(None, queued["run_id"])

    brief = (await client.get(f"/api/v1/projects/{pid}/production-brief")).json()
    # Approved by the chain, not left dangling: the next stage reads the
    # approved pointer, so it has to be the version that was just published.
    assert brief["approved_version_id"] == brief["latest_version_id"]
    # And the studio can tell that apart from a creator's own approval.
    assert brief["approval"]["automatic"] is True

    async with SessionLocal() as session:
        approval = await session.scalar(
            select(ApprovalDecision).where(
                ApprovalDecision.version_id == brief["latest_version_id"]
            )
        )
        # An automatic approval is still a decision with an actor, and not the
        # creator's: the studio must never tell someone they approved something
        # they never saw.
        assert approval is not None
        assert approval.actor_id == "decode:auto-continue"
        assert "automatically" in (approval.note or "")

        plan_job = await session.scalar(
            select(Job).where(Job.project_id == pid, Job.kind == "generate_teaching_plan")
        )
        assert plan_job is not None
        assert plan_job.status == "queued"
        # The intent travelled forward from the brief job unchanged; nobody had
        # to name it a second time.
        roles = {
            item.role: item.version_id
            for item in (
                await session.scalars(select(JobInput).where(JobInput.job_id == plan_job.id))
            ).all()
        }
        assert roles == {
            "production_brief": brief["latest_version_id"],
            "production_intent": intent["version_id"],
        }
        # The queue has the work: the chain went through the outbox like every
        # other job, not around it.
        assert await session.scalar(
            select(func.count(OutboxEvent.id)).where(
                OutboxEvent.aggregate_id == plan_job.active_run_id
            )
        )
        run_id = plan_job.active_run_id

    assert (await execute_run(None, run_id))["status"] == "succeeded"

    async with SessionLocal() as session:
        plan_artifact = await session.scalar(
            select(Artifact).where(
                Artifact.project_id == pid, Artifact.artifact_type == ArtifactType.TEACHING_PLAN
            )
        )
        assert plan_artifact is not None
        plan_version = await session.get(ArtifactVersion, plan_artifact.latest_version_id)
        assert plan_version is not None
        plan_beats = [beat["id"] for beat in plan_version.payload["beats"]]

    # The chain does not stop at the plan. One request reaches a script, with
    # each stage approved on the creator's behalf as it is handed on.
    async with SessionLocal() as session:
        script_job = await session.scalar(
            select(Job).where(Job.project_id == pid, Job.kind == "generate_script")
        )
        assert script_job is not None
        roles = {
            item.role
            for item in (
                await session.scalars(select(JobInput).where(JobInput.job_id == script_job.id))
            ).all()
        }
        assert roles == {"teaching_plan", "production_intent"}
        script_run_id = script_job.active_run_id

    assert (await execute_run(None, script_run_id))["status"] == "succeeded"

    # The visuals follow, then the narration — five departments, one request.
    async with SessionLocal() as session:
        visuals_job = await session.scalar(
            select(Job).where(Job.project_id == pid, Job.kind == "generate_scene_visuals")
        )
        assert visuals_job is not None
        visuals_run_id = visuals_job.active_run_id

    assert (await execute_visual_graph(visuals_run_id))["status"] == "succeeded"
    # Visuals are done, but the chain has already queued the narration, so the
    # project is still processing rather than resting on Edit.
    studio = (await client.get(f"/api/v1/projects/{pid}/studio")).json()
    assert studio["current_stage"] == "processing"
    assert studio["project"]["auto_continue"] is True

    # Voice consumes only the carried script and intent, so the chain reaches it
    # without the creator choosing new inputs.
    async with SessionLocal() as session:
        voice_job = await session.scalar(
            select(Job).where(Job.project_id == pid, Job.kind == "generate_voice")
        )
        assert voice_job is not None
        voice_roles = {
            item.role
            for item in (
                await session.scalars(select(JobInput).where(JobInput.job_id == voice_job.id))
            ).all()
        }
        assert voice_roles == {"script", "production_intent"}
        voice_run_id = voice_job.active_run_id

    assert (await execute_run(None, voice_run_id))["status"] == "succeeded"

    # With narration rendered, the whole chain has landed on Edit.
    studio = (await client.get(f"/api/v1/projects/{pid}/studio")).json()
    assert studio["current_stage"] == "edit"

    # Every chained hop says why it chose the next step: brief→plan,
    # plan→script, script→visuals, visuals→voice.
    async with SessionLocal() as session:
        decided = list(
            (
                await session.scalars(
                    select(ProjectEvent)
                    .where(
                        ProjectEvent.project_id == pid,
                        ProjectEvent.type == "production.chain.decided",
                    )
                    .order_by(ProjectEvent.id)
                )
            ).all()
        )
        assert [event.data["next"] for event in decided] == [
            "generate_teaching_plan",
            "generate_script",
            "generate_scene_visuals",
            "generate_voice",
        ]
        assert all(event.data["reason"] for event in decided)

    async with SessionLocal() as session:
        voice_artifact = await session.scalar(
            select(Artifact).where(
                Artifact.project_id == pid, Artifact.artifact_type == ArtifactType.VOICE
            )
        )
        assert voice_artifact is not None
        voice_version = await session.get(ArtifactVersion, voice_artifact.latest_version_id)
        assert voice_version is not None
        # One narration clip per approved beat, keyed by the same beat ids.
        assert {clip["beat_id"] for clip in voice_version.payload["clips"]} == set(plan_beats)

    async with SessionLocal() as session:
        script_artifact = await session.scalar(
            select(Artifact).where(
                Artifact.project_id == pid, Artifact.artifact_type == ArtifactType.SCRIPT
            )
        )
        assert script_artifact is not None
        version = await session.get(ArtifactVersion, script_artifact.latest_version_id)
        assert version is not None
        # The Writer owns this handoff, and every beat of the approved plan has
        # exactly one passage.
        assert version.owner_role == "writer"
        assert len(version.payload["beats"]) == len(plan_beats)
        assert [b["beat_id"] for b in version.payload["beats"]] == plan_beats


@pytest.mark.asyncio
async def test_turning_chaining_off_stops_after_each_stage(client):
    project, source, intent = await create_inputs(client, auto_continue=True)
    pid = project["project_id"]
    patched = await client.patch(f"/api/v1/projects/{pid}", json={"auto_continue": False})
    assert patched.status_code == 200 and patched.json()["auto_continue"] is False

    queued = (
        await client.post(
            f"/api/v1/projects/{pid}/production-brief/generations",
            json={
                "source_version_ids": [source["source_version_id"]],
                "intent_version_id": intent["version_id"],
            },
            headers={"Idempotency-Key": "generation"},
        )
    ).json()
    await execute_run(None, queued["run_id"])

    brief = (await client.get(f"/api/v1/projects/{pid}/production-brief")).json()
    # Nothing was approved on the creator's behalf and nothing was spent.
    assert brief["approved_version_id"] is None
    assert brief["approval"] is None
    async with SessionLocal() as session:
        assert not await session.scalar(
            select(func.count(Job.id)).where(
                Job.project_id == pid, Job.kind == "generate_teaching_plan"
            )
        )


@pytest.mark.asyncio
async def test_the_script_is_editable_and_the_plan_is_not(client):
    """Narration is editable in exactly one place, and this endpoint is behind it."""
    project, source, intent = await create_inputs(client, auto_continue=True)
    pid = project["project_id"]
    queued = (
        await client.post(
            f"/api/v1/projects/{pid}/production-brief/generations",
            json={
                "source_version_ids": [source["source_version_id"]],
                "intent_version_id": intent["version_id"],
            },
            headers={"Idempotency-Key": "generation"},
        )
    ).json()
    await execute_run(None, queued["run_id"])

    async with SessionLocal() as session:
        plan_job = await session.scalar(
            select(Job).where(Job.project_id == pid, Job.kind == "generate_teaching_plan")
        )
        assert plan_job is not None
        await execute_run(None, plan_job.active_run_id)
        script_job = await session.scalar(
            select(Job).where(Job.project_id == pid, Job.kind == "generate_script")
        )
        assert script_job is not None
    await execute_run(None, script_job.active_run_id)

    async with SessionLocal() as session:
        script_artifact = await session.scalar(
            select(Artifact).where(
                Artifact.project_id == pid, Artifact.artifact_type == ArtifactType.SCRIPT
            )
        )
        assert script_artifact is not None
        base_id = script_artifact.latest_version_id
        approved_before = script_artifact.approved_version_id
        base = await session.get(ArtifactVersion, base_id)
        assert base is not None
        payload = dict(base.payload)
        plan_artifact = await session.scalar(
            select(Artifact).where(
                Artifact.project_id == pid, Artifact.artifact_type == ArtifactType.TEACHING_PLAN
            )
        )
        assert plan_artifact is not None
        plan_artifact_id, plan_version_id = plan_artifact.id, plan_artifact.latest_version_id

    payload["beats"][0]["narration"] = "The words a person actually wanted."
    edited = await client.post(
        f"/api/v1/projects/{pid}/artifacts/{script_artifact.id}/versions",
        json={"base_version_id": base_id, "schema_version": 1, "payload": payload},
        headers={"Idempotency-Key": "edit-script"},
    )
    assert edited.status_code == 201, edited.text
    assert edited.json()["payload"]["beats"][0]["narration"] == (
        "The words a person actually wanted."
    )
    # An edit moves latest and leaves approved behind, so the script correctly
    # reads as awaiting review again rather than silently staying approved.
    assert edited.json()["latest_version_id"] == edited.json()["version_id"]
    assert edited.json()["approved_version_id"] == approved_before
    assert edited.json()["latest_is_approved"] is False

    # A payload that is not a script is refused before anything immutable lands.
    broken = await client.post(
        f"/api/v1/projects/{pid}/artifacts/{script_artifact.id}/versions",
        json={
            "base_version_id": edited.json()["version_id"],
            "schema_version": 1,
            "payload": {"rationale": "no beats"},
        },
        headers={"Idempotency-Key": "edit-script-broken"},
    )
    assert broken.status_code == 422
    assert broken.json()["code"] == "validation_failed"

    # The plan is not a payload swap: reordering beats resets the script written
    # against them, so it is a command rather than an edit.
    refused = await client.post(
        f"/api/v1/projects/{pid}/artifacts/{plan_artifact_id}/versions",
        json={"base_version_id": plan_version_id, "schema_version": 1, "payload": {}},
        headers={"Idempotency-Key": "edit-plan"},
    )
    assert refused.status_code == 400
    assert refused.json()["code"] == "invalid_command"


@pytest.mark.asyncio
async def test_voice_generation_requires_approved_script_and_publishes_clips(client):
    """The Narrator reads the approved Script into one clip per beat."""
    project, source, intent = await create_inputs(client)
    pid = project["project_id"]

    # Chain up to an approved script: brief → plan → script.
    brief = (await client.post(
        f"/api/v1/projects/{pid}/production-brief/generations",
        json={
            "source_version_ids": [source["source_version_id"]],
            "intent_version_id": intent["version_id"],
        },
        headers={"Idempotency-Key": "brief"},
    )).json()
    await execute_run(None, brief["run_id"])
    brief_view = (await client.get(f"/api/v1/projects/{pid}/production-brief")).json()
    await client.post(
        f"/api/v1/projects/{pid}/artifacts/{brief_view['artifact_id']}/versions/"
        f"{brief_view['latest_version_id']}/approvals",
        json={"decision": "approved"},
        headers={"Idempotency-Key": "approve-brief"},
    )
    plan = (await client.post(
        f"/api/v1/projects/{pid}/teaching-plan/generations",
        json={
            "brief_version_id": brief_view["latest_version_id"],
            "intent_version_id": intent["version_id"],
        },
        headers={"Idempotency-Key": "plan"},
    )).json()
    await execute_run(None, plan["run_id"])
    async with SessionLocal() as session:
        plan_artifact = await session.scalar(
            select(Artifact).where(
                Artifact.project_id == pid,
                Artifact.artifact_type == ArtifactType.TEACHING_PLAN,
            )
        )
        assert plan_artifact is not None
        await client.post(
            f"/api/v1/projects/{pid}/artifacts/{plan_artifact.id}/versions/"
            f"{plan_artifact.latest_version_id}/approvals",
            json={"decision": "approved"},
            headers={"Idempotency-Key": "approve-plan"},
        )

    script = (await client.post(
        f"/api/v1/projects/{pid}/script/generations",
        json={
            "plan_version_id": plan_artifact.latest_version_id,
            "intent_version_id": intent["version_id"],
        },
        headers={"Idempotency-Key": "script"},
    )).json()
    await execute_run(None, script["run_id"])
    async with SessionLocal() as session:
        script_artifact = await session.scalar(
            select(Artifact).where(
                Artifact.project_id == pid, Artifact.artifact_type == ArtifactType.SCRIPT
            )
        )
        assert script_artifact is not None
        await client.post(
            f"/api/v1/projects/{pid}/artifacts/{script_artifact.id}/versions/"
            f"{script_artifact.latest_version_id}/approvals",
            json={"decision": "approved"},
            headers={"Idempotency-Key": "approve-script"},
        )

    voice = (await client.post(
        f"/api/v1/projects/{pid}/voice/generations",
        json={
            "script_version_id": script_artifact.latest_version_id,
            "intent_version_id": intent["version_id"],
        },
        headers={"Idempotency-Key": "voice"},
    ))
    assert voice.status_code == 202
    await execute_run(None, voice.json()["run_id"])

    async with SessionLocal() as session:
        voice_artifact = await session.scalar(
            select(Artifact).where(
                Artifact.project_id == pid, Artifact.artifact_type == ArtifactType.VOICE
            )
        )
        assert voice_artifact is not None
        version = await session.get(ArtifactVersion, voice_artifact.latest_version_id)
        assert version is not None
        # Fixture narrator produces a clip per script beat and labels itself.
        assert version.payload["voice_findings"]["fixture"] is True
        script_version = await session.get(ArtifactVersion, script_artifact.latest_version_id)
        assert len(version.payload["clips"]) == len(script_version.payload["beats"])
