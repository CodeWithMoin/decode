from decimal import Decimal

from arq.connections import RedisSettings
from sqlalchemy import select

from ..config import get_settings
from ..db import SessionLocal, utcnow
from ..domain import emit, publish_version
from ..models import Artifact, ArtifactVersion, Evaluation, Job, JobInput, Project, Run, UsageRecord
from ..providers.producer import FakeEvaluator, FakeProducer
from ..schemas import ProductionIntent


async def execute_run(_ctx: dict | None, run_id: str) -> dict:
    async with SessionLocal() as session:
        run = await session.scalar(select(Run).where(Run.id == run_id).with_for_update())
        if not run:
            return {"status": "missing"}
        job = await session.scalar(select(Job).where(Job.id == run.job_id).with_for_update())
        assert job is not None
        if job.active_run_id != run.id:
            return {"status": "stale_run"}
        if run.status == "succeeded" or job.result_artifact_version_id:
            return {"status": "already_succeeded", "version_id": job.result_artifact_version_id}
        # The stable ARQ job id prevents concurrent delivery. A redelivery may
        # find a stale running row after process loss and resumes it here.
        run.status = "running"
        run.started_at = run.started_at or utcnow()
        run.failure = None
        run.finished_at = None
        job.status = "running"
        job.started_at = job.started_at or utcnow()
        job.failure = None
        job.finished_at = None
        project = await session.scalar(
            select(Project).where(Project.id == job.project_id).with_for_update()
        )
        assert project is not None
        project.status = "processing"
        await emit(
            session,
            job.project_id,
            "run.started",
            job_id=job.id,
            run_id=run.id,
            data={"message": "Preparing focused context"},
        )
        await emit(
            session,
            job.project_id,
            "run.progress",
            job_id=job.id,
            run_id=run.id,
            data={"step": "reading_sources"},
        )
        await session.commit()
    try:
        async with SessionLocal() as session:
            run = await session.scalar(select(Run).where(Run.id == run_id).with_for_update())
            assert run is not None
            job = await session.scalar(select(Job).where(Job.id == run.job_id).with_for_update())
            assert job is not None
            if job.active_run_id != run.id:
                return {"status": "stale_run"}
            inputs = list(
                (await session.scalars(select(JobInput).where(JobInput.job_id == job.id))).all()
            )
            versions = {
                v.id: v
                for v in (
                    await session.scalars(
                        select(ArtifactVersion).where(
                            ArtifactVersion.id.in_([i.version_id for i in inputs])
                        )
                    )
                ).all()
            }
            intent_input = next(i for i in inputs if i.role == "production_intent")
            source_inputs = [i for i in inputs if i.role == "source"]
            intent = ProductionIntent.model_validate(versions[intent_input.version_id].payload)
            source_bytes = sum(
                (versions[item.version_id].blob_manifest or {}).get("size_bytes", 0)
                for item in source_inputs
            )
            await emit(
                session,
                job.project_id,
                "run.progress",
                job_id=job.id,
                run_id=run.id,
                data={"step": "generating_brief", "source_count": len(source_inputs)},
            )
            brief = FakeProducer().generate(intent, len(source_inputs), source_bytes)
            project = await session.scalar(
                select(Project)
                .where(Project.id == job.project_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            assert project is not None
            artifact = await session.scalar(
                select(Artifact).where(
                    Artifact.project_id == job.project_id,
                    Artifact.artifact_type == "production_brief",
                )
            )
            if not artifact:
                artifact = Artifact(
                    project_id=job.project_id,
                    artifact_type="production_brief",
                    stable_key="default",
                )
                session.add(artifact)
                await session.flush()
            parents = [(item.version_id, item.role) for item in inputs]
            if job.active_run_id != run.id:
                return {"status": "stale_run"}
            version = await publish_version(
                session,
                artifact,
                payload=brief.model_dump(mode="json"),
                owner_role="producer",
                created_by=f"run:{run.id}",
                run_id=run.id,
                supersedes_latest=True,
                rationale="Deterministic fake Producer output for the walking skeleton.",
                parents=parents,
            )
            await emit(
                session,
                job.project_id,
                "artifact.version.created",
                job_id=job.id,
                run_id=run.id,
                artifact_id=artifact.id,
                version_id=version.id,
                data={"artifact_type": "production_brief", "sequence": version.sequence},
            )
            await emit(
                session,
                job.project_id,
                "run.progress",
                job_id=job.id,
                run_id=run.id,
                artifact_id=artifact.id,
                version_id=version.id,
                data={"step": "evaluating_brief"},
            )
            decision, checks, summary = FakeEvaluator().evaluate(brief)
            session.add(
                Evaluation(
                    artifact_version_id=version.id,
                    evaluator=FakeEvaluator.identifier,
                    decision=decision,
                    checks=checks,
                    summary=summary,
                )
            )
            session.add_all(
                [
                    UsageRecord(
                        job_id=job.id,
                        run_id=run.id,
                        artifact_version_id=version.id,
                        provider="fake",
                        operation="production_brief_generation",
                        model=FakeProducer.identifier,
                        duration_ms=0,
                        estimated_cost_usd=Decimal("0"),
                    ),
                    UsageRecord(
                        job_id=job.id,
                        run_id=run.id,
                        artifact_version_id=version.id,
                        provider="fake",
                        operation="production_brief_evaluation",
                        model=FakeEvaluator.identifier,
                        duration_ms=0,
                        estimated_cost_usd=Decimal("0"),
                    ),
                ]
            )
            run.status = "succeeded"
            run.finished_at = utcnow()
            job.status = "succeeded"
            job.result_artifact_version_id = version.id
            job.finished_at = utcnow()
            project.status = "ready"
            await emit(
                session,
                job.project_id,
                "artifact.ready_for_review",
                job_id=job.id,
                run_id=run.id,
                artifact_id=artifact.id,
                version_id=version.id,
                data={
                    "message": "Production Brief ready for review",
                    "evaluation_decision": decision,
                },
            )
            await emit(
                session,
                job.project_id,
                "job.succeeded",
                job_id=job.id,
                run_id=run.id,
                artifact_id=artifact.id,
                version_id=version.id,
                data={"message": "Production Brief generation complete"},
            )
            await session.commit()
            return {"status": "succeeded", "version_id": version.id}
    except Exception:
        async with SessionLocal() as session:
            run = await session.scalar(select(Run).where(Run.id == run_id).with_for_update())
            assert run is not None
            job = await session.scalar(select(Job).where(Job.id == run.job_id).with_for_update())
            assert job is not None
            failure = {
                "code": "producer_failed",
                "message": "Production Brief generation failed.",
                "retryable": True,
            }
            run.status = "failed"
            run.failure = failure
            run.finished_at = utcnow()
            if job.active_run_id != run.id:
                await session.commit()
                raise
            job.status = "failed"
            job.failure = failure
            job.finished_at = utcnow()
            project = await session.get(Project, job.project_id)
            assert project is not None
            project.status = "failed"
            await emit(
                session, job.project_id, "run.failed", job_id=job.id, run_id=run.id, data=failure
            )
            await session.commit()
        raise


class WorkerSettings:
    functions = [execute_run]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = 10
    job_timeout = 300
