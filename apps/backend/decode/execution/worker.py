from time import perf_counter

from arq.connections import RedisSettings
from sqlalchemy import select

from ..agents import tracing
from ..config import get_settings
from ..db import SessionLocal, utcnow
from ..domain import emit, publish_version
from ..models import (
    Artifact,
    ArtifactVersion,
    ExecutionStatus,
    Job,
    JobInput,
    Project,
    ProjectStatus,
    Run,
    UsageRecord,
)
from ..pricing import estimate_cost
from .context import context_assembler
from .pipeline import continue_chain, run_department, run_evaluation, stage_for, stage_provider


async def execute_run(_ctx: dict | None, run_id: str) -> dict:
    trace_context = None
    traced_run = None
    async with SessionLocal() as session:
        run = await session.scalar(select(Run).where(Run.id == run_id).with_for_update())
        if not run:
            return {"status": "missing"}
        job = await session.scalar(select(Job).where(Job.id == run.job_id).with_for_update())
        assert job is not None
        if job.active_run_id != run.id:
            return {"status": "stale_run"}
        if run.status == ExecutionStatus.SUCCEEDED or job.result_artifact_version_id:
            return {"status": "already_succeeded", "version_id": job.result_artifact_version_id}
        # The stable ARQ job id prevents concurrent delivery. A redelivery may
        # find a stale running row after process loss and resumes it here.
        run.status = ExecutionStatus.RUNNING
        run.started_at = run.started_at or utcnow()
        run.failure = None
        run.finished_at = None
        job.status = ExecutionStatus.RUNNING
        job.started_at = job.started_at or utcnow()
        job.failure = None
        job.finished_at = None
        project = await session.scalar(
            select(Project).where(Project.id == job.project_id).with_for_update()
        )
        assert project is not None
        project.status = ProjectStatus.PROCESSING
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
            stage = stage_for(job.kind)
            # The run manifest carries the per-request facts a regeneration needs
            # (which beat, what direction) that no immutable input encodes. Every
            # other stage ignores it and builds from inputs alone.
            context = context_assembler.assemble(stage, inputs, versions, run.context_manifest)
            intent = context.intent
            settings = get_settings()
            trace_context = tracing.run(
                job.kind,
                run_id=run.id,
                job_id=job.id,
                project_id=job.project_id,
                actor_id=settings.actor_id,
                input={
                    "job_kind": job.kind,
                    "production_intent": intent.model_dump(mode="json"),
                    "input_versions": [
                        {"version_id": item.version_id, "role": item.role} for item in inputs
                    ],
                },
                metadata={"artifact_type": stage.produces},
            )
            traced_run = trace_context.__enter__()
            await emit(
                session,
                job.project_id,
                "run.progress",
                job_id=job.id,
                run_id=run.id,
                data={"step": stage.progress_step, "input_count": len(inputs)},
            )
            started = perf_counter()
            department, artifact_payload = await run_department(settings, context)
            generation_ms = int((perf_counter() - started) * 1000)
            # Token counts are optional on the port: a deterministic department
            # spends none, so absent means "not metered" rather than zero.
            usage = getattr(department, "last_usage", None)
            spent_model, spent_in, spent_out = (
                (usage.model, usage.input_tokens, usage.output_tokens)
                if usage
                else (None, None, None)
            )
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
                    Artifact.artifact_type == stage.produces,
                )
            )
            if not artifact:
                artifact = Artifact(
                    project_id=job.project_id,
                    artifact_type=stage.produces,
                    stable_key="default",
                )
                session.add(artifact)
                await session.flush()
            parents = [(item.version_id, item.role) for item in inputs]
            if job.active_run_id != run.id:
                traced_run.update(output={"status": "stale_run"})
                trace_context.__exit__(None, None, None)
                trace_context = None
                return {"status": "stale_run"}
            version = await publish_version(
                session,
                artifact,
                payload=artifact_payload.model_dump(mode="json"),
                owner_role=stage.owner_role,
                created_by=f"run:{run.id}",
                run_id=run.id,
                supersedes_latest=True,
                rationale=f"{stage.produces} generated by {department.identifier}.",
                parents=parents,
                schema_version=stage.schema_version,
            )
            await emit(
                session,
                job.project_id,
                "artifact.version.created",
                job_id=job.id,
                run_id=run.id,
                artifact_id=artifact.id,
                version_id=version.id,
                data={"artifact_type": stage.produces, "sequence": version.sequence},
            )
            usage_records = [
                UsageRecord(
                    job_id=job.id,
                    run_id=run.id,
                    artifact_version_id=version.id,
                    provider=stage_provider(settings, job.kind),
                    operation=f"{stage.produces}_generation",
                    model=department.identifier,
                    input_tokens=spent_in,
                    output_tokens=spent_out,
                    duration_ms=generation_ms,
                    # Priced on the model that actually ran, not on `model=`
                    # above: that column carries the department identifier,
                    # which pins the skills version but is not something a
                    # provider publishes a rate for.
                    estimated_cost_usd=estimate_cost(spent_model, spent_in, spent_out),
                )
            ]

            evaluation = await run_evaluation(
                settings,
                session,
                job=job,
                run=run,
                stage=stage,
                artifact=artifact,
                version=version,
                context=context,
                artifact_payload=artifact_payload,
            )
            if evaluation is not None:
                usage_records.append(evaluation.usage)
            session.add_all(usage_records)
            run.status = ExecutionStatus.SUCCEEDED
            run.finished_at = utcnow()
            job.status = ExecutionStatus.SUCCEEDED
            job.result_artifact_version_id = version.id
            job.finished_at = utcnow()
            project.status = ProjectStatus.READY
            # After the project is marked ready, so that a chain which starts
            # the next stage puts it back to processing rather than the other
            # way round. Same transaction: the finished run and the job that
            # follows it are one fact.
            chained = await continue_chain(session, job, artifact, version)
            await emit(
                session,
                job.project_id,
                "artifact.ready_for_review",
                job_id=job.id,
                run_id=run.id,
                artifact_id=artifact.id,
                version_id=version.id,
                data={
                    "message": f"{stage.label} ready for review",
                    "artifact_type": stage.produces,
                    "evaluation_decision": evaluation.decision if evaluation else None,
                    # So the studio can show "ready, and the next stage is
                    # already running" instead of an approval prompt for a
                    # decision the chain has already taken.
                    "auto_approved": chained is not None,
                    "continued_job_id": chained.id if chained else None,
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
                data={"message": f"{stage.label} complete", "artifact_type": stage.produces},
            )
            await session.commit()
            trace_output = {
                "status": "succeeded",
                "artifact_version_id": version.id,
                "artifact_type": stage.produces,
                "artifact": artifact_payload.model_dump(mode="json"),
                "evaluation": (
                    {
                        "evaluator": evaluation.evaluator,
                        "decision": evaluation.decision,
                        "checks": evaluation.checks,
                        "summary": evaluation.summary,
                    }
                    if evaluation is not None
                    else None
                ),
            }
            traced_run.update(output=trace_output)
            if evaluation is not None:
                tracing.score(
                    observation=traced_run,
                    name=f"{stage.produces}_quality",
                    value=evaluation.decision,
                    comment=evaluation.summary,
                    metadata={
                        "artifact_version_id": version.id,
                        "evaluator": evaluation.evaluator,
                        "checks": evaluation.checks,
                    },
                )
            trace_context.__exit__(None, None, None)
            trace_context = None
            return {"status": "succeeded", "version_id": version.id}
    except Exception as exc:
        if trace_context is not None:
            trace_context.__exit__(type(exc), exc, exc.__traceback__)
            trace_context = None
        async with SessionLocal() as session:
            run = await session.scalar(select(Run).where(Run.id == run_id).with_for_update())
            assert run is not None
            job = await session.scalar(select(Job).where(Job.id == run.job_id).with_for_update())
            assert job is not None
            failed_stage = stage_for(job.kind)
            failure = {
                "code": f"{failed_stage.produces}_generation_failed",
                "message": f"{failed_stage.label} generation failed.",
                "retryable": True,
            }
            run.status = ExecutionStatus.FAILED
            run.failure = failure
            run.finished_at = utcnow()
            if job.active_run_id != run.id:
                await session.commit()
                raise
            job.status = ExecutionStatus.FAILED
            job.failure = failure
            job.finished_at = utcnow()
            project = await session.get(Project, job.project_id)
            assert project is not None
            project.status = ProjectStatus.FAILED
            await emit(
                session, job.project_id, "run.failed", job_id=job.id, run_id=run.id, data=failure
            )
            await session.commit()
        # A failed run is the one whose trace is wanted now, not at the next
        # export interval.
        tracing.flush()
        raise


async def _startup(_ctx: dict) -> None:
    # Once per process: the Langfuse client owns a background exporter thread,
    # so building one per run would leak them. A worker with no Langfuse
    # configured logs nothing and behaves identically.
    tracing.configure(get_settings())


class WorkerSettings:
    functions = [execute_run]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = 10
    job_timeout = 300
    on_startup = _startup
