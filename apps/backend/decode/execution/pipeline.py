"""The Project Manager: what Decode knows how to produce, and how work starts.

`PROJECT_CONTEXT.md` calls this the Project Manager and `decode-backend-foundation.md`
§6 places it in the application layer, between the command handlers and the
departments. Departments never invoke each other; this is what routes between
them.

It is deliberately smaller than that description today. §98 of the plan says
"encode Decode's known workflow in application code before considering a
user-configurable workflow engine", and Decode currently knows one stage. So
this module owns three things:

    STAGES          what a job kind produces, and which inputs it requires
    run_department  which department runs a kind
    start_run       create an attempt and hand it to the queue, durably
    continue_chain  checkpoint policy: which stage a finished one starts next

Checkpoint policy (§14) is `CHAIN` plus `Project.auto_continue`, and it was a
product decision rather than an inherited one: automatic downstream work spends
the creator's money without asking, so it is the creator's per-project switch
and nothing else. What chaining does *not* do is collapse the artifacts —
the Teaching Plan stays its own versioned artifact with its own approval,
because that is what keeps reordering beats cheap instead of a rewrite.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from time import perf_counter

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings
from ..db import utcnow
from ..departments.contracts import Department
from ..departments.registry import architect, author, evaluator, intake, visualizer, voice
from ..departments.skills import Manifest
from ..domain import canonical_hash, emit
from ..models import (
    ApprovalDecision,
    Artifact,
    ArtifactType,
    ArtifactVersion,
    Evaluation,
    ExecutionStatus,
    Job,
    JobInput,
    OutboxEvent,
    Project,
    ProjectStatus,
    Run,
    UsageRecord,
)
from ..pricing import estimate_cost
from ..schemas import ProductionBrief, TeachingPlan
from .context import (
    ArchitectContext,
    AuthorContext,
    DepartmentContext,
    IntakeContext,
    RegenerateVisualContext,
    VisualizerContext,
    VoiceContext,
)


def _discover() -> dict[str, Stage]:
    """Build the stage table by reading every department's SKILL.md.

    Derived rather than hand-written: a department already declares what it
    produces, what it consumes and which crew role it presents as, and keeping a
    second copy here is how the two drift. Adding a department is a folder.
    """
    from ..departments.architect.prompt import SKILLS as ARCHITECT
    from ..departments.author.prompt import SKILLS as AUTHOR
    from ..departments.intake.prompt import SKILLS as INTAKE
    from ..departments.visualizer.prompt import SKILLS as VISUALIZER
    from ..departments.voice.prompt import SKILLS as VOICE

    return {
        skills.manifest.job_kind: Stage(skills.manifest)
        for skills in (INTAKE, ARCHITECT, AUTHOR, VISUALIZER, VOICE)
    }


@dataclass(frozen=True)
class Stage:
    """One department's slot in the production, read from its manifest.

    A stage almost always *is* its manifest. The two overrides exist for the one
    case that isn't a department of its own: a targeted regeneration reuses the
    Visualizer's manifest — same department, produces, crew role and schema — but
    runs under its own job kind (so it never triggers the chain) and reads an
    extra input (the scenes it is revising). Everything else still comes from the
    shared manifest, so the two can never drift on what a scene *is*.
    """

    manifest: Manifest
    kind_override: str | None = None
    consumes_override: tuple[str, ...] | None = None

    @property
    def kind(self) -> str:
        return self.kind_override or self.manifest.job_kind

    @property
    def produces(self) -> ArtifactType:
        return ArtifactType(self.manifest.produces)

    @property
    def label(self) -> str:
        return self.manifest.label

    @property
    def consumes(self) -> tuple[str, ...]:
        return self.consumes_override or self.manifest.consumes

    @property
    def owner_role(self) -> str:
        return self.manifest.crew_role

    @property
    def progress_step(self) -> str:
        return self.manifest.progress_step

    @property
    def provider_setting(self) -> str:
        return self.manifest.provider_setting

    @property
    def schema_version(self) -> int:
        return self.manifest.schema_version


STAGES: dict[str, Stage] = _discover()

# Regeneration is not a department — it is the Visualizer, invoked on one scene.
# Registered here rather than discovered so it never appears in the CHAIN (a
# per-scene redraw must not re-run voice) and reads the current scenes as an
# extra input. Absent from CHAIN, `continue_chain` returns None for it.
REGENERATE_SCENE_VISUAL = "regenerate_scene_visual"
STAGES[REGENERATE_SCENE_VISUAL] = Stage(
    STAGES["generate_scene_visuals"].manifest,
    kind_override=REGENERATE_SCENE_VISUAL,
    consumes_override=("script", "teaching_plan", "production_intent", "scene_visuals"),
)


def stage_provider(settings: Settings, kind: str) -> str:
    """The configured provider name for a stage, recorded on its usage rows."""
    return str(getattr(settings, stage_for(kind).provider_setting))


def stage_for(kind: str) -> Stage:
    stage = STAGES.get(kind)
    if stage is None:
        # A job kind nobody declared must not fall through to a default stage and
        # quietly publish the wrong artifact type.
        raise ValueError(f"no stage is registered for job kind {kind!r}")
    return stage


async def run_department(
    settings: Settings,
    context: DepartmentContext,
) -> tuple[Department, BaseModel]:
    """Route a job to the department that owns it, and return what it produced.

    This is the routing the plan asks the Project Manager for: the worker knows
    how to run *a* department durably, and nothing about which one. Adding a
    stage is a branch here plus a row in STAGES — not a change to job semantics,
    lineage, or the outbox.

    The department instance comes back too, because the caller needs its
    identifier and token usage for provenance and metering.
    """
    if isinstance(context, IntakeContext):
        department = intake(settings)
        return department, await department.generate(context.intent, list(context.sources))

    if isinstance(context, ArchitectContext):
        director = architect(settings)
        return director, await director.generate(context.intent, context.brief)

    if isinstance(context, AuthorContext):
        writer = author(settings)
        return writer, await writer.generate(context.intent, context.plan)

    if isinstance(context, VisualizerContext):
        designer = visualizer(settings)
        return designer, await designer.generate(context.intent, context.plan, context.script)

    if isinstance(context, RegenerateVisualContext):
        designer = visualizer(settings)
        return designer, await designer.regenerate_one(
            context.intent,
            context.plan,
            context.script,
            list(context.prior_scenes),
            context.beat_id,
            context.direction,
        )

    if isinstance(context, VoiceContext):
        narrator = voice(settings)
        return narrator, await narrator.generate(context.intent, context.script)

    raise ValueError(f"no department runs context {type(context).__name__}")


# Which produced artifacts the independent Evaluator judges. Absent types are not
# oversights — they are stages nobody has written a rubric for yet. Extending
# evaluation to the Script or scene visuals is a member here plus an evaluator
# method, not a change to the worker.
EVALUATED_TYPES = frozenset({ArtifactType.PRODUCTION_BRIEF, ArtifactType.TEACHING_PLAN})


@dataclass(frozen=True)
class EvaluationOutcome:
    """What the Evaluator recorded about one just-published version.

    Carries the metering row back to the worker rather than adding it here, so
    the worker keeps the whole run's usage as one list it commits together.
    """

    evaluator: str
    decision: str
    checks: list[dict]
    summary: str
    usage: UsageRecord


async def run_evaluation(
    settings: Settings,
    session: AsyncSession,
    *,
    job: Job,
    run: Run,
    stage: Stage,
    artifact: Artifact,
    version: ArtifactVersion,
    context: DepartmentContext,
    artifact_payload: BaseModel,
) -> EvaluationOutcome | None:
    """Judge the version this run just published, in the same transaction.

    Evaluation is not its own stage: it produces no artifact version, and running
    it inline is what lets `artifact.ready_for_review` carry the decision as one
    fact rather than a second job the studio has to wait on. What belonged in the
    Project Manager, and lives here now rather than in the worker, is the policy —
    which artifact types get judged, and which evaluator call each one takes.

    Returns None for a stage with no rubric. The Evaluation row is added to the
    caller's session; the usage row rides back on the outcome so the worker
    commits every meter for the run together.
    """
    if stage.produces not in EVALUATED_TYPES:
        return None

    judge = evaluator(settings)
    step = (
        "evaluating_brief" if stage.produces == ArtifactType.PRODUCTION_BRIEF else "evaluating_plan"
    )
    await emit(
        session,
        job.project_id,
        "run.progress",
        job_id=job.id,
        run_id=run.id,
        artifact_id=artifact.id,
        version_id=version.id,
        data={"step": step},
    )

    started = perf_counter()
    if stage.produces == ArtifactType.PRODUCTION_BRIEF:
        assert isinstance(artifact_payload, ProductionBrief)
        decision, checks, summary = await judge.evaluate_brief(context.intent, artifact_payload)
    else:
        assert isinstance(artifact_payload, TeachingPlan)
        assert isinstance(context, ArchitectContext)
        decision, checks, summary = await judge.evaluate_plan(
            context.intent, context.brief, artifact_payload
        )
    elapsed_ms = int((perf_counter() - started) * 1000)

    session.add(
        Evaluation(
            artifact_version_id=version.id,
            evaluator=judge.identifier,
            decision=decision,
            checks=checks,
            summary=summary,
        )
    )
    spent = judge.last_usage
    usage = UsageRecord(
        job_id=job.id,
        run_id=run.id,
        artifact_version_id=version.id,
        provider=settings.evaluator,
        operation=f"{stage.produces}_evaluation",
        model=judge.identifier,
        input_tokens=spent.input_tokens if spent else None,
        output_tokens=spent.output_tokens if spent else None,
        duration_ms=elapsed_ms,
        estimated_cost_usd=(
            estimate_cost(spent.model, spent.input_tokens, spent.output_tokens)
            if spent
            else Decimal("0")
        ),
    )
    return EvaluationOutcome(judge.identifier, decision, checks, summary, usage)


async def start_run(
    session: AsyncSession,
    job: Job,
    *,
    manifest: dict,
    context_hash: str | None = None,
    message: str,
) -> Run:
    """Create the next attempt at a job and commit it to the queue.

    Everything here has to land in the caller's transaction: the Run, the outbox
    row, the project status and the progress event are one fact, and a crash
    between them is what the transactional outbox exists to rule out. This
    function never commits — the command handler owns that boundary.

    `context_hash` is passed only by a retry, which reuses the previous attempt's
    manifest verbatim and so must keep its hash rather than recompute one.
    """
    attempt = (
        await session.scalar(select(func.max(Run.attempt)).where(Run.job_id == job.id)) or 0
    ) + 1
    run = Run(
        job_id=job.id,
        attempt=attempt,
        context_manifest=manifest,
        context_hash=context_hash or canonical_hash(manifest),
    )
    session.add(run)
    await session.flush()

    job.active_run_id = run.id
    job.status = ExecutionStatus.QUEUED
    job.failure = None
    job.finished_at = None
    # A retry must not keep pointing at the previous attempt's output, or the
    # worker's "already succeeded" guard would short-circuit the new attempt.
    job.result_artifact_version_id = None

    project = await session.get(Project, job.project_id)
    assert project is not None
    project.status = ProjectStatus.PROCESSING
    project.updated_at = utcnow()

    session.add(OutboxEvent(topic="run.execute", aggregate_id=run.id, payload={"run_id": run.id}))
    await emit(
        session,
        job.project_id,
        "job.queued",
        job_id=job.id,
        run_id=run.id,
        data={"message": message},
    )
    return run


async def create_job(
    session: AsyncSession,
    project_id: str,
    kind: str,
    *,
    inputs: list[tuple[str, str]],
    manifest: dict,
    message: str,
) -> tuple[Job, Run]:
    """Record a request for one stage's output, and start its first attempt.

    `inputs` is `(version_id, role)` pairs. They are recorded on the job as well
    as in the run manifest because they answer different questions later: what
    the job was asked to read, versus what the run was given.
    """
    stage = stage_for(kind)
    roles = {role for _, role in inputs}
    if roles != set(stage.consumes):
        raise ValueError(f"{kind} consumes {sorted(stage.consumes)}, but was given {sorted(roles)}")

    job = Job(project_id=project_id, kind=kind)
    session.add(job)
    await session.flush()
    for version_id, role in inputs:
        session.add(JobInput(job_id=job.id, version_id=version_id, role=role))

    run = await start_run(session, job, manifest=manifest, message=message)
    return job, run


# Which stage follows which. Read as "the brief is done, the plan is next".
#
# A kind that is absent is where the production stops today, not one that was
# forgotten. Adding the Author is one entry here plus its department folder.
CHAIN: dict[str, str] = {
    "generate_production_brief": "generate_teaching_plan",
    "generate_teaching_plan": "generate_script",
    "generate_script": "generate_scene_visuals",
    # Voice needs only the script and intent, both already carried through the
    # visuals job, so narration is reached without the creator choosing inputs.
    # Audio is the timing authority (ADR-005); a chain that stopped at visuals
    # left the scene with no runtime to derive.
    "generate_scene_visuals": "generate_voice",
}

# The actor a chained approval is recorded under. Deliberately not the server's
# configured actor, which is the creator: an approval nobody clicked has to be
# distinguishable from one they did, or the studio shows "you approved this" to
# someone who never saw it. This is the value the UI reads to say who did.
CHAIN_ACTOR = "decode:auto-continue"


async def continue_chain(
    session: AsyncSession,
    job: Job,
    artifact: Artifact,
    version: ArtifactVersion,
) -> Job | None:
    """Start the stage that follows a successful one, if the project is chaining.

    This is the checkpoint policy the module docstring said was missing (§14),
    written deliberately: the *artifacts* stay separate, because that is what
    makes reordering beats cheap instead of throwing away narration, but the
    *stop* between them is now the creator's per-project choice. Off means the
    old behaviour exactly — a pointer moves and nothing else happens.

    It must run inside the worker's success transaction. The next job, its
    outbox row and the completed run are one fact; committing the run and
    crashing before the chain would leave a production that silently stalled.

    Returns None whenever the chain cannot continue rather than raising. A run
    that already produced a real artifact must not be failed — and so retried,
    and so paid for twice — because the stage after it was not satisfiable.
    """
    project = await session.get(Project, job.project_id)
    if project is None or not project.auto_continue:
        return None
    next_kind = CHAIN.get(job.kind)
    if next_kind is None:
        return None
    produces, next_stage = stage_for(job.kind).produces, stage_for(next_kind)

    carried: dict[str, list[str]] = {}
    for item in await session.scalars(select(JobInput).where(JobInput.job_id == job.id)):
        carried.setdefault(item.role, []).append(item.version_id)

    inputs: list[tuple[str, str]] = []
    for role in next_stage.consumes:
        if role == produces:
            inputs.append((version.id, role))
        elif role in carried:
            # Anything the finished job was given and the next one also needs —
            # the production intent, today — travels forward unchanged.
            inputs.extend((version_id, role) for version_id in carried[role])
        else:
            # A stage needing something this one never saw is a stage the
            # creator has to start themselves, with inputs only they can choose.
            return None

    # The next stage reads the *approved* version, so a chained run has to say
    # out loud that it approved on the creator's behalf. Recorded as a real
    # decision with the server's actor rather than by quietly moving the
    # pointer: "who approved this" must never have an empty answer.
    if artifact.approved_version_id != version.id:
        session.add(
            ApprovalDecision(
                artifact_id=artifact.id,
                version_id=version.id,
                decision="approved",
                actor_id=CHAIN_ACTOR,
                note=(
                    "Approved automatically to continue the production. "
                    "Editing it publishes a new version for review."
                ),
            )
        )
        artifact.approved_version_id = version.id

    next_job, _ = await create_job(
        session,
        job.project_id,
        next_kind,
        inputs=inputs,
        manifest={
            "schema": 1,
            "chained_from_job_id": job.id,
            "inputs": [{"version_id": v, "role": r} for v, r in inputs],
        },
        message=f"{next_stage.label} queued automatically",
    )
    return next_job
