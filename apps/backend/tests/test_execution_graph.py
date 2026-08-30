import asyncio
from datetime import timedelta

import pytest
from sqlalchemy import func, select

from decode.agents.contracts import ProviderUsage
from decode.agents.fixtures import FakeVisualDirector, FakeVisualizer
from decode.db import SessionLocal, utcnow
from decode.domain import publish_version
from decode.execution import graph
from decode.execution.dispatcher import dispatch_once
from decode.execution.graph import (
    ASSEMBLY_TASK,
    SCENE_TASK,
    VISUAL_DIRECTION_TASK,
    execute_task,
)
from decode.execution.pipeline import create_job, start_run
from decode.execution.worker import execute_run
from decode.models import (
    Artifact,
    ArtifactType,
    Job,
    OutboxEvent,
    ProductionTask,
    ProductionTaskDependency,
    Project,
    ProjectEvent,
    Run,
    UsageRecord,
)


def _intent() -> dict:
    return {
        "creative_brief": "Teach a system",
        "audience": "Curious beginners",
        "target_duration_seconds": 60,
        "runtime_mode": "fixed",
        "depth": "balanced",
        "narration_style": "friendly",
        "brand": {"colors": [], "fonts": None, "guidelines": None},
    }


def _plan(count: int) -> dict:
    return {
        "structure_name": "Build the idea",
        "sections": [{"id": "main", "title": "Main", "purpose": "Teach it clearly"}],
        "through_line": "Each scene adds one part.",
        "rationale": "I ordered the dependencies before their consequences.",
        "beats": [
            {
                "id": f"beat-{index + 1}",
                "title": f"Part {index + 1}",
                "objective": f"Understand part {index + 1}",
                "target_duration_seconds": 20,
                "section_id": "main",
                "key_points": [f"Point {index + 1}"],
                "depends_on": [] if index == 0 else [f"beat-{index}"],
                "brief_support": {"learning_objectives": [0]},
                "example": None,
                "visual_opportunity": "Show the relationship.",
            }
            for index in range(count)
        ],
        "plan_findings": {"fixture": True},
    }


def _script(count: int) -> dict:
    return {
        "rationale": "I wrote one passage for each beat.",
        "beats": [
            {
                "beat_id": f"beat-{index + 1}",
                "narration": f"This is part {index + 1}.",
                "segments": [f"Part {index + 1}"],
            }
            for index in range(count)
        ],
        "script_findings": {"fixture": True},
    }


async def _create_visual_run(count: int = 3) -> tuple[str, str, str]:
    async with SessionLocal() as session:
        project = Project(title="Graph", auto_continue=False)
        session.add(project)
        await session.flush()
        versions: dict[str, str] = {}
        for artifact_type, payload in (
            (ArtifactType.PRODUCTION_INTENT, _intent()),
            (ArtifactType.TEACHING_PLAN, _plan(count)),
            (ArtifactType.SCRIPT, _script(count)),
        ):
            artifact = Artifact(
                project_id=project.id,
                artifact_type=artifact_type,
                stable_key="default",
            )
            session.add(artifact)
            await session.flush()
            version = await publish_version(
                session,
                artifact,
                payload=payload,
                owner_role="fixture",
                created_by="test",
            )
            versions[str(artifact_type)] = version.id
        job, run = await create_job(
            session,
            project.id,
            "generate_scene_visuals",
            inputs=[
                (versions[str(ArtifactType.SCRIPT)], "script"),
                (versions[str(ArtifactType.TEACHING_PLAN)], "teaching_plan"),
                (versions[str(ArtifactType.PRODUCTION_INTENT)], "production_intent"),
            ],
            manifest={"schema": 1},
            message="Motion Designer queued",
        )
        await session.commit()
        return project.id, job.id, run.id


async def _tasks(run_id: str, kind: str) -> list[ProductionTask]:
    async with SessionLocal() as session:
        return list(
            (
                await session.scalars(
                    select(ProductionTask)
                    .where(ProductionTask.run_id == run_id, ProductionTask.kind == kind)
                    .order_by(ProductionTask.priority.desc())
                )
            ).all()
        )


async def _execute_direction(run_id: str) -> ProductionTask:
    task = (await _tasks(run_id, VISUAL_DIRECTION_TASK))[0]
    assert (await execute_task(None, task.id, task.attempt))["status"] == "succeeded"
    return (await _tasks(run_id, VISUAL_DIRECTION_TASK))[0]


async def test_scene_graph_fans_out_then_publishes_once_after_fan_in(client):
    project_id, job_id, run_id = await _create_visual_run()
    started = await execute_run(None, run_id)
    assert started["status"] == "scheduled"

    scenes = await _tasks(run_id, SCENE_TASK)
    direction = (await _tasks(run_id, VISUAL_DIRECTION_TASK))[0]
    assembly = (await _tasks(run_id, ASSEMBLY_TASK))[0]
    assert direction.status == "queued"
    assert all(task.status == "pending" and task.attempt == 0 for task in scenes)
    assert [task.input["beat_id"] for task in scenes] == ["beat-1", "beat-2", "beat-3"]
    assert len({task.priority for task in scenes}) == 3
    assert assembly.status == "pending"
    async with SessionLocal() as session:
        assert (
            await session.scalar(
                select(func.count(ProductionTaskDependency.id)).where(
                    ProductionTaskDependency.task_id == assembly.id
                )
            )
            == 3
        )
        assert (
            await session.scalar(
                select(func.count(ProductionTaskDependency.id)).where(
                    ProductionTaskDependency.prerequisite_task_id == direction.id
                )
            )
            == 3
        )

    await _execute_direction(run_id)
    scenes = await _tasks(run_id, SCENE_TASK)
    assert all(task.status == "queued" and task.attempt == 1 for task in scenes)
    assert (await execute_task(None, scenes[0].id, 1))["status"] == "candidate_ready"
    assert (await _tasks(run_id, ASSEMBLY_TASK))[0].status == "pending"
    results = await asyncio.gather(
        *(execute_task(None, task.id, 1) for task in scenes[1:])
    )
    assert {result["status"] for result in results} == {"candidate_ready"}
    # Scenes auto-accept as they land, so the fan-in releases without clicks.
    assembly = (await _tasks(run_id, ASSEMBLY_TASK))[0]
    assert assembly.status == "queued"

    candidates = (
        await client.get(f"/api/v1/projects/{project_id}/jobs/{job_id}/scene-candidates")
    ).json()["items"]
    assert [candidate["beat_id"] for candidate in candidates] == [
        "beat-1",
        "beat-2",
        "beat-3",
    ]
    for index, candidate in enumerate(candidates):
        accepted = await client.post(
            f"/api/v1/projects/{project_id}/jobs/{job_id}/scene-candidates/"
            f"{candidate['task_id']}/acceptances",
            json={"component_source": candidate["scene"]["component_source"]},
            headers={"Idempotency-Key": f"accept-candidate-{index}"},
        )
        assert accepted.status_code == 200
        assert accepted.json()["accepted_at"] is not None

    assembly = (await _tasks(run_id, ASSEMBLY_TASK))[0]
    assert assembly.status == "queued"
    assembled = await execute_task(None, assembly.id, assembly.attempt)
    assert assembled["status"] == "succeeded"

    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        artifact = await session.scalar(
            select(Artifact).where(
                Artifact.project_id == project_id,
                Artifact.artifact_type == ArtifactType.SCENE_VISUALS,
            )
        )
        assert job is not None and job.status == "succeeded"
        assert artifact is not None and artifact.latest_version_id == assembled["version_id"]
        assert (
            await session.scalar(
                select(func.count(UsageRecord.id)).where(UsageRecord.run_id == run_id)
            )
            == 4
        )
        succeeded = list(
            (
                await session.scalars(
                    select(ProjectEvent).where(
                        ProjectEvent.project_id == project_id,
                        ProjectEvent.type == "production.task.succeeded",
                    )
                )
            ).all()
        )
        assert len(succeeded) == 5

    detail = (await client.get(f"/api/v1/projects/{project_id}/jobs/{job_id}")).json()
    assert len(detail["tasks"]) == 5
    assert all(task["status"] == "succeeded" for task in detail["tasks"])
    assert all(
        task["accepted_at"] is not None
        for task in detail["tasks"]
        if task["kind"] == SCENE_TASK
    )


async def test_failed_scene_retries_without_repeating_successful_siblings(monkeypatch):
    class FlakyVisualizer(FakeVisualizer):
        def __init__(self):
            self.failures = 0

        async def generate(self, intent, plan, script, *, focused_direction=None):
            if plan.beats[0].id == "beat-2" and self.failures == 0:
                self.failures += 1
                raise RuntimeError("transient provider failure")
            return await super().generate(
                intent, plan, script, focused_direction=focused_direction
            )

    designer = FlakyVisualizer()
    monkeypatch.setattr(graph, "visualizer", lambda _settings: designer)
    _, _, run_id = await _create_visual_run(2)
    await execute_run(None, run_id)
    await _execute_direction(run_id)
    first, second = await _tasks(run_id, SCENE_TASK)

    assert (await execute_task(None, first.id, 1))["status"] == "candidate_ready"
    retried = await execute_task(None, second.id, 1)
    assert retried == {"status": "retrying", "attempt": 2}
    assert (await execute_task(None, second.id, 1))["status"] == "stale_task"
    assert (await execute_task(None, second.id, 2))["status"] == "candidate_ready"

    refreshed = await _tasks(run_id, SCENE_TASK)
    assert [(task.input["beat_id"], task.attempt) for task in refreshed] == [
        ("beat-1", 1),
        ("beat-2", 2),
    ]
    assert all(task.status == "succeeded" for task in refreshed)


async def test_each_scene_receives_only_its_focused_direction(monkeypatch):
    class RecordingVisualizer(FakeVisualizer):
        def __init__(self):
            self.focuses = []

        async def generate(self, intent, plan, script, *, focused_direction=None):
            self.focuses.append(focused_direction)
            return await super().generate(
                intent, plan, script, focused_direction=focused_direction
            )

    designer = RecordingVisualizer()
    monkeypatch.setattr(graph, "visualizer", lambda _settings: designer)
    _, _, run_id = await _create_visual_run(3)
    await execute_run(None, run_id)
    await _execute_direction(run_id)
    scenes = await _tasks(run_id, SCENE_TASK)
    for scene in scenes:
        assert (await execute_task(None, scene.id, scene.attempt))["status"] == "candidate_ready"

    assert [focus.storyboard.beat_id for focus in designer.focuses] == [
        "beat-1",
        "beat-2",
        "beat-3",
    ]
    assert designer.focuses[0].incoming_handoff is None
    assert designer.focuses[0].outgoing_handoff.to_beat_id == "beat-2"
    assert designer.focuses[1].incoming_handoff.from_beat_id == "beat-1"
    assert designer.focuses[1].outgoing_handoff.to_beat_id == "beat-3"
    assert designer.focuses[2].incoming_handoff.from_beat_id == "beat-2"
    assert designer.focuses[2].outgoing_handoff is None


async def test_visual_direction_retries_before_releasing_scenes(monkeypatch):
    class FlakyVisualDirector(FakeVisualDirector):
        def __init__(self):
            self.calls = 0

        async def generate(self, intent, plan, script):
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("transient direction failure")
            return await super().generate(intent, plan, script)

    director = FlakyVisualDirector()
    monkeypatch.setattr(graph, "visual_director", lambda _settings: director)
    _, _, run_id = await _create_visual_run(2)
    await execute_run(None, run_id)
    direction = (await _tasks(run_id, VISUAL_DIRECTION_TASK))[0]

    assert await execute_task(None, direction.id, 1) == {"status": "retrying", "attempt": 2}
    assert all(task.status == "pending" for task in await _tasks(run_id, SCENE_TASK))
    assert (await execute_task(None, direction.id, 1))["status"] == "stale_task"
    assert (await execute_task(None, direction.id, 2))["status"] == "succeeded"
    assert all(task.status == "queued" for task in await _tasks(run_id, SCENE_TASK))
    async with SessionLocal() as session:
        usages = list(
            (
                await session.scalars(
                    select(UsageRecord).where(UsageRecord.run_id == run_id)
                )
            ).all()
        )
    assert [usage.operation for usage in usages] == ["visual_direction_generation"]


async def test_visual_direction_exhaustion_fails_without_degraded_scenes(monkeypatch):
    class BrokenVisualDirector(FakeVisualDirector):
        async def generate(self, intent, plan, script):
            raise RuntimeError("direction unavailable")

    monkeypatch.setattr(graph, "visual_director", lambda _settings: BrokenVisualDirector())
    _, job_id, run_id = await _create_visual_run(2)
    await execute_run(None, run_id)
    direction = (await _tasks(run_id, VISUAL_DIRECTION_TASK))[0]

    assert (await execute_task(None, direction.id, 1))["status"] == "retrying"
    with pytest.raises(RuntimeError, match="direction unavailable"):
        await execute_task(None, direction.id, 2)

    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        tasks = list(
            (
                await session.scalars(
                    select(ProductionTask).where(ProductionTask.run_id == run_id)
                )
            ).all()
        )
    assert job is not None and job.status == "failed"
    assert next(task for task in tasks if task.kind == VISUAL_DIRECTION_TASK).status == "failed"
    assert all(task.status == "cancelled" for task in tasks if task.kind != VISUAL_DIRECTION_TASK)
    assert all(task.output is None for task in tasks if task.kind == SCENE_TASK)


async def test_paid_failed_direction_attempt_is_metered(monkeypatch):
    class PaidBrokenVisualDirector(FakeVisualDirector):
        async def generate(self, intent, plan, script):
            self.last_usage = ProviderUsage("paid-model", 120, 30, 1, 0.012)
            raise RuntimeError("invalid paid draft")

    monkeypatch.setattr(
        graph, "visual_director", lambda _settings: PaidBrokenVisualDirector()
    )
    _, _, run_id = await _create_visual_run(1)
    await execute_run(None, run_id)
    direction = (await _tasks(run_id, VISUAL_DIRECTION_TASK))[0]

    assert (await execute_task(None, direction.id, 1))["status"] == "retrying"
    async with SessionLocal() as session:
        usages = list(
            (
                await session.scalars(
                    select(UsageRecord).where(UsageRecord.run_id == run_id)
                )
            ).all()
        )
    assert len(usages) == 1
    assert usages[0].model == "paid-model"
    assert usages[0].input_tokens == 120
    assert float(usages[0].estimated_cost_usd or 0) == pytest.approx(0.012)


async def test_stale_direction_lease_is_periodically_requeued() -> None:
    _, _, run_id = await _create_visual_run(1)
    await execute_run(None, run_id)
    direction = (await _tasks(run_id, VISUAL_DIRECTION_TASK))[0]
    claimed = await graph._claim_task(direction.id, direction.attempt, 1)
    assert claimed == (VISUAL_DIRECTION_TASK, run_id)
    async with SessionLocal() as session:
        task = await session.get(ProductionTask, direction.id)
        assert task is not None
        task.started_at = utcnow() - timedelta(seconds=graph.STALE_TASK_LEASE_SECONDS + 1)
        initial_outboxes = list((await session.scalars(select(OutboxEvent))).all())
        for event in initial_outboxes:
            event.published_at = utcnow()
        await session.commit()

    assert await graph.reconcile_stale_graph_tasks() == {
        "status": "reconciled",
        "requeued": 1,
    }
    refreshed = (await _tasks(run_id, VISUAL_DIRECTION_TASK))[0]
    assert refreshed.status == "queued"
    assert refreshed.started_at is None
    assert refreshed.input["delivery"] == 2
    assert (await execute_task(None, direction.id, direction.attempt, 1))["status"] == "stale_task"
    assert all(task.status == "pending" for task in await _tasks(run_id, SCENE_TASK))

    class RecordingRedis:
        def __init__(self):
            self.calls = []

        async def enqueue_job(self, *args, **kwargs):
            self.calls.append((args, kwargs))

    redis = RecordingRedis()
    assert await dispatch_once(redis) == 1
    assert redis.calls == [
        (
            ("execute_task", direction.id, direction.attempt, 2),
            {"_job_id": f"task:{direction.id}:attempt:{direction.attempt}:delivery:2"},
        )
    ]


async def test_candidate_acceptance_revalidates_the_exact_previewed_source(client):
    project_id, job_id, run_id = await _create_visual_run(1)
    await execute_run(None, run_id)
    await _execute_direction(run_id)
    scene = (await _tasks(run_id, SCENE_TASK))[0]
    await execute_task(None, scene.id, scene.attempt)
    candidate = (
        await client.get(f"/api/v1/projects/{project_id}/jobs/{job_id}/scene-candidates")
    ).json()["items"][0]
    invalid = candidate["scene"]["component_source"].replace(
        'from "@decode/animation-api"', 'from "gsap"'
    )

    rejected = await client.post(
        f"/api/v1/projects/{project_id}/jobs/{job_id}/scene-candidates/"
        f"{candidate['task_id']}/acceptances",
        json={"component_source": invalid},
        headers={"Idempotency-Key": "reject-invalid-candidate"},
    )

    # The candidate auto-accepted with its generated source, so a different
    # source is refused rather than replacing the accepted one.
    assert rejected.status_code == 409
    refreshed = (await _tasks(run_id, SCENE_TASK))[0]
    assert refreshed.accepted_at is not None
    assert (await _tasks(run_id, ASSEMBLY_TASK))[0].status == "queued"


async def test_cancellation_discards_late_direction_but_records_its_usage(client, monkeypatch):
    class BlockingVisualDirector(FakeVisualDirector):
        def __init__(self):
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def generate(self, intent, plan, script):
            self.started.set()
            await self.release.wait()
            return await super().generate(intent, plan, script)

    director = BlockingVisualDirector()
    monkeypatch.setattr(graph, "visual_director", lambda _settings: director)
    project_id, job_id, run_id = await _create_visual_run(1)
    await execute_run(None, run_id)
    direction = (await _tasks(run_id, VISUAL_DIRECTION_TASK))[0]
    in_flight = asyncio.create_task(execute_task(None, direction.id, direction.attempt))
    await director.started.wait()

    cancelled = await client.post(
        f"/api/v1/projects/{project_id}/jobs/{job_id}/cancellations",
        json={"expected_active_run_id": run_id},
        headers={"Idempotency-Key": "cancel-direction"},
    )
    assert cancelled.status_code == 200
    director.release.set()
    assert (await in_flight)["status"] == "cancelled"

    async with SessionLocal() as session:
        usages = list(
            (
                await session.scalars(
                    select(UsageRecord).where(UsageRecord.run_id == run_id)
                )
            ).all()
        )
    assert [usage.operation for usage in usages] == ["visual_direction_generation"]
    assert all(task.status == "cancelled" for task in await _tasks(run_id, SCENE_TASK))


async def test_cancellation_discards_a_scene_result_that_finishes_late(client, monkeypatch):
    class BlockingVisualizer(FakeVisualizer):
        def __init__(self):
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def generate(self, intent, plan, script, *, focused_direction=None):
            self.started.set()
            await self.release.wait()
            return await super().generate(
                intent, plan, script, focused_direction=focused_direction
            )

    designer = BlockingVisualizer()
    monkeypatch.setattr(graph, "visualizer", lambda _settings: designer)
    project_id, job_id, run_id = await _create_visual_run(1)
    await execute_run(None, run_id)
    await _execute_direction(run_id)
    scene = (await _tasks(run_id, SCENE_TASK))[0]
    in_flight = asyncio.create_task(execute_task(None, scene.id, 1))
    await designer.started.wait()

    cancelled = await client.post(
        f"/api/v1/projects/{project_id}/jobs/{job_id}/cancellations",
        json={"expected_active_run_id": run_id},
        headers={"Idempotency-Key": "cancel-graph"},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    designer.release.set()
    assert (await in_flight)["status"] == "cancelled"

    async with SessionLocal() as session:
        run = await session.get(Run, run_id)
        job = await session.get(Job, job_id)
        tasks = list(
            (
                await session.scalars(
                    select(ProductionTask).where(ProductionTask.run_id == run_id)
                )
            ).all()
        )
        usages = list(
            (
                await session.scalars(
                    select(UsageRecord).where(UsageRecord.run_id == run_id)
                )
            ).all()
        )
        assert run is not None and run.status == "cancelled"
        assert job is not None and job.status == "cancelled"
        direction = next(task for task in tasks if task.kind == VISUAL_DIRECTION_TASK)
        assert direction.status == "succeeded"
        assert all(
            task.status == "cancelled"
            for task in tasks
            if task.kind != VISUAL_DIRECTION_TASK
        )
        assert [usage.operation for usage in usages] == ["visual_direction_generation"]

    replay = await client.post(
        f"/api/v1/projects/{project_id}/jobs/{job_id}/cancellations",
        json={"expected_active_run_id": run_id},
        headers={"Idempotency-Key": "cancel-graph"},
    )
    assert replay.json() == cancelled.json()


async def test_a_replaced_run_makes_every_old_task_delivery_stale():
    _, job_id, old_run_id = await _create_visual_run(1)
    await execute_run(None, old_run_id)
    old_task = (await _tasks(old_run_id, SCENE_TASK))[0]
    async with SessionLocal() as session:
        job = await session.get(Job, job_id)
        old_run = await session.get(Run, old_run_id)
        assert job is not None and old_run is not None
        old_run.status = "failed"
        job.status = "failed"
        replacement = await start_run(
            session,
            job,
            manifest=old_run.context_manifest,
            context_hash=old_run.context_hash,
            message="Retry queued",
        )
        await session.commit()

    assert (await execute_task(None, old_task.id, old_task.attempt))["status"] == "stale_run"
    async with SessionLocal() as session:
        old_task = await session.get(ProductionTask, old_task.id)
        job = await session.get(Job, job_id)
        assert old_task is not None and old_task.status == "pending"
        assert job is not None and job.active_run_id == replacement.id


async def test_dispatcher_sends_higher_priority_tasks_first():
    class RecordingRedis:
        def __init__(self):
            self.calls = []

        async def enqueue_job(self, *args, **kwargs):
            self.calls.append((args, kwargs))

    async with SessionLocal() as session:
        session.add_all(
            [
                OutboxEvent(
                    topic="run.execute",
                    aggregate_id="run-low",
                    payload={"run_id": "run-low"},
                    priority=0,
                ),
                OutboxEvent(
                    topic="task.execute",
                    aggregate_id="task-high",
                    payload={"task_id": "task-high", "attempt": 2},
                    priority=50,
                ),
            ]
        )
        await session.commit()
    redis = RecordingRedis()
    assert await dispatch_once(redis) == 2
    assert redis.calls == [
        (
            ("execute_task", "task-high", 2, 1),
            {"_job_id": "task:task-high:attempt:2:delivery:1"},
        ),
        (("execute_run", "run-low"), {"_job_id": "run:run-low"}),
    ]
