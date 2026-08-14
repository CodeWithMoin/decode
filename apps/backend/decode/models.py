from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base, new_id, utcnow

# StrEnum, not sqlalchemy.Enum: a StrEnum *is* its string, so these store into the
# existing VARCHAR columns unchanged and need no migration. A native Postgres enum
# would also mean an ALTER TYPE for every artifact type a new department adds, and
# has no SQLite equivalent for the test database.
#
# The value is the point — these words are compared across three files each, and
# a typo in any one of them takes a wrong branch silently instead of raising.


class ExecutionStatus(StrEnum):
    """Shared by Job and Run: a request and its attempts move in lockstep."""

    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class ProjectStatus(StrEnum):
    DRAFT = "draft"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class SourceStatus(StrEnum):
    UPLOADING = "uploading"
    READY = "ready"
    FAILED = "failed"


class ArtifactType(StrEnum):
    SOURCE = "source"
    PRODUCTION_INTENT = "production_intent"
    PRODUCTION_BRIEF = "production_brief"
    TEACHING_PLAN = "teaching_plan"
    SCRIPT = "script"
    SCENE_VISUALS = "scene_visuals"
    VOICE = "voice"


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(300), default="Untitled Decode")
    status: Mapped[str] = mapped_column(String(32), default=ProjectStatus.DRAFT)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    # Set instead of deleting: artifact_versions rejects DELETE by trigger, so a
    # cascade would abort. Every read path filters on this being NULL.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    # Whether one stage finishing starts the next one. On by default: a creator
    # who asks for a video wants a video, not four separate button presses.
    # Off is the creator saying "stop after each stage so I can read it first",
    # and is the only thing between one click and a chain of paid runs.
    auto_continue: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))


class Artifact(Base):
    __tablename__ = "artifacts"
    __table_args__ = (UniqueConstraint("project_id", "artifact_type", "stable_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    artifact_type: Mapped[str] = mapped_column(String(40), index=True)
    stable_key: Mapped[str] = mapped_column(String(100), default="default")
    latest_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("artifact_versions.id", name="fk_artifacts_latest_version", use_alter=True),
        nullable=True,
    )
    approved_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("artifact_versions.id", name="fk_artifacts_approved_version", use_alter=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ArtifactVersion(Base):
    __tablename__ = "artifact_versions"
    __table_args__ = (UniqueConstraint("artifact_id", "sequence"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    artifact_id: Mapped[str] = mapped_column(
        ForeignKey("artifacts.id", ondelete="CASCADE"), index=True
    )
    sequence: Mapped[int] = mapped_column(Integer)
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    blob_manifest: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    owner_role: Mapped[str] = mapped_column(String(40))
    created_by: Mapped[str] = mapped_column(String(100))
    run_id: Mapped[str | None] = mapped_column(
        ForeignKey("runs.id", name="fk_artifact_versions_run", use_alter=True),
        nullable=True,
        index=True,
    )
    supersedes_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("artifact_versions.id", name="fk_artifact_versions_supersedes"), nullable=True
    )
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ArtifactDependency(Base):
    __tablename__ = "artifact_dependencies"
    __table_args__ = (UniqueConstraint("child_version_id", "parent_version_id", "role"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    child_version_id: Mapped[str] = mapped_column(
        ForeignKey("artifact_versions.id", ondelete="CASCADE"), index=True
    )
    parent_version_id: Mapped[str] = mapped_column(ForeignKey("artifact_versions.id"), index=True)
    role: Mapped[str] = mapped_column(String(50))


class Source(Base):
    __tablename__ = "sources"
    __table_args__ = (UniqueConstraint("project_id", "command_identity"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    artifact_id: Mapped[str | None] = mapped_column(ForeignKey("artifacts.id"), nullable=True)
    version_id: Mapped[str | None] = mapped_column(
        ForeignKey("artifact_versions.id"), nullable=True
    )
    filename: Mapped[str] = mapped_column(String(500))
    source_kind: Mapped[str] = mapped_column(String(40))
    media_type: Mapped[str] = mapped_column(String(200))
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=SourceStatus.UPLOADING)
    object_key: Mapped[str] = mapped_column(String(1000))
    upload_lease_id: Mapped[str] = mapped_column(String(36), default=new_id)
    command_identity: Mapped[str] = mapped_column(String(64))
    request_metadata_hash: Mapped[str] = mapped_column(String(64))
    byte_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    failure: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(60), default="generate_production_brief")
    status: Mapped[str] = mapped_column(String(20), default=ExecutionStatus.QUEUED)
    active_run_id: Mapped[str | None] = mapped_column(
        ForeignKey("runs.id", name="fk_jobs_active_run", use_alter=True), nullable=True
    )
    result_artifact_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("artifact_versions.id", name="fk_jobs_result_version", use_alter=True),
        nullable=True,
    )
    failure: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (UniqueConstraint("job_id", "attempt"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    attempt: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default=ExecutionStatus.QUEUED)
    context_manifest: Mapped[dict] = mapped_column(JSON)
    context_hash: Mapped[str] = mapped_column(String(64))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failure: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class JobInput(Base):
    __tablename__ = "job_inputs"
    __table_args__ = (UniqueConstraint("job_id", "version_id", "role"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("artifact_versions.id"))
    role: Mapped[str] = mapped_column(String(50))


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    topic: Mapped[str] = mapped_column(String(80))
    aggregate_id: Mapped[str] = mapped_column(String(36), index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Evaluation(Base):
    __tablename__ = "evaluations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    artifact_version_id: Mapped[str] = mapped_column(ForeignKey("artifact_versions.id"), index=True)
    evaluator: Mapped[str] = mapped_column(String(100))
    decision: Mapped[str] = mapped_column(String(30))
    checks: Mapped[list] = mapped_column(JSON)
    summary: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UsageRecord(Base):
    __tablename__ = "usage_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    artifact_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    provider: Mapped[str] = mapped_column(String(80))
    operation: Mapped[str] = mapped_column(String(80))
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # NULL means unpriced, not free. See migration 0003.
    estimated_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ApprovalDecision(Base):
    __tablename__ = "approval_decisions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    artifact_id: Mapped[str] = mapped_column(ForeignKey("artifacts.id"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("artifact_versions.id"), index=True)
    decision: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_id: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProjectEvent(Base):
    __tablename__ = "project_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(80))
    job_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    artifact_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    artifact_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("actor_id", "scope", "key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor_id: Mapped[str] = mapped_column(String(100))
    scope: Mapped[str] = mapped_column(String(200))
    key: Mapped[str] = mapped_column(String(200))
    request_hash: Mapped[str] = mapped_column(String(64))
    status_code: Mapped[int] = mapped_column(Integer)
    response: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
