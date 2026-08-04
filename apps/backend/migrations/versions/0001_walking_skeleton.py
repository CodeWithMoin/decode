"""Create the walking-skeleton ledger and PostgreSQL immutability guard."""

import sqlalchemy as sa
from alembic import op

revision = "0001_walking_skeleton"
down_revision = None
branch_labels = None
depends_on = None

S = sa.String
DT = sa.DateTime(timezone=True)


def upgrade():
    op.create_table(
        "projects",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("title", S(300), nullable=False),
        sa.Column("status", S(32), nullable=False),
        sa.Column("created_at", DT, nullable=False),
        sa.Column("updated_at", DT, nullable=False),
    )
    op.create_table(
        "idempotency_records",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("actor_id", S(100), nullable=False),
        sa.Column("scope", S(200), nullable=False),
        sa.Column("key", S(200), nullable=False),
        sa.Column("request_hash", S(64), nullable=False),
        sa.Column("status_code", sa.Integer, nullable=False),
        sa.Column("response", sa.JSON, nullable=False),
        sa.Column("created_at", DT, nullable=False),
        sa.UniqueConstraint("actor_id", "scope", "key", name="uq_idempotency_records_actor_id"),
    )
    op.create_table(
        "outbox_events",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("topic", S(80), nullable=False),
        sa.Column("aggregate_id", S(36), nullable=False),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("published_at", DT),
        sa.Column("attempts", sa.Integer, nullable=False),
        sa.Column("created_at", DT, nullable=False),
    )
    op.create_index("ix_outbox_events_aggregate_id", "outbox_events", ["aggregate_id"])
    op.create_table(
        "artifacts",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("project_id", S(36), nullable=False),
        sa.Column("artifact_type", S(40), nullable=False),
        sa.Column("stable_key", S(100), nullable=False),
        sa.Column("latest_version_id", S(36)),
        sa.Column("approved_version_id", S(36)),
        sa.Column("created_at", DT, nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_artifacts_project_id_projects",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "project_id", "artifact_type", "stable_key", name="uq_artifacts_project_id"
        ),
    )
    op.create_index("ix_artifacts_project_id", "artifacts", ["project_id"])
    op.create_index("ix_artifacts_artifact_type", "artifacts", ["artifact_type"])
    op.create_table(
        "jobs",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("project_id", S(36), nullable=False),
        sa.Column("kind", S(60), nullable=False),
        sa.Column("status", S(20), nullable=False),
        sa.Column("active_run_id", S(36)),
        sa.Column("result_artifact_version_id", S(36)),
        sa.Column("failure", sa.JSON),
        sa.Column("created_at", DT, nullable=False),
        sa.Column("started_at", DT),
        sa.Column("finished_at", DT),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], name="fk_jobs_project_id_projects", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_jobs_project_id", "jobs", ["project_id"])
    op.create_table(
        "project_events",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("project_id", S(36), nullable=False),
        sa.Column("type", S(80), nullable=False),
        sa.Column("job_id", S(36)),
        sa.Column("run_id", S(36)),
        sa.Column("artifact_id", S(36)),
        sa.Column("artifact_version_id", S(36)),
        sa.Column("data", sa.JSON, nullable=False),
        sa.Column("occurred_at", DT, nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_project_events_project_id_projects",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_project_events_project_id", "project_events", ["project_id"])
    op.create_table(
        "artifact_versions",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("artifact_id", S(36), nullable=False),
        sa.Column("sequence", sa.Integer, nullable=False),
        sa.Column("schema_version", sa.Integer, nullable=False),
        sa.Column("payload", sa.JSON),
        sa.Column("blob_manifest", sa.JSON),
        sa.Column("content_hash", S(64), nullable=False),
        sa.Column("owner_role", S(40), nullable=False),
        sa.Column("created_by", S(100), nullable=False),
        sa.Column("run_id", S(36)),
        sa.Column("supersedes_version_id", S(36)),
        sa.Column("rationale", sa.Text),
        sa.Column("created_at", DT, nullable=False),
        sa.ForeignKeyConstraint(
            ["artifact_id"],
            ["artifacts.id"],
            name="fk_artifact_versions_artifact_id_artifacts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["supersedes_version_id"],
            ["artifact_versions.id"],
            name="fk_artifact_versions_supersedes",
        ),
        sa.UniqueConstraint("artifact_id", "sequence", name="uq_artifact_versions_artifact_id"),
    )
    op.create_index("ix_artifact_versions_artifact_id", "artifact_versions", ["artifact_id"])
    op.create_index("ix_artifact_versions_content_hash", "artifact_versions", ["content_hash"])
    op.create_index("ix_artifact_versions_run_id", "artifact_versions", ["run_id"])
    op.create_table(
        "runs",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("job_id", S(36), nullable=False),
        sa.Column("attempt", sa.Integer, nullable=False),
        sa.Column("status", S(20), nullable=False),
        sa.Column("context_manifest", sa.JSON, nullable=False),
        sa.Column("context_hash", S(64), nullable=False),
        sa.Column("started_at", DT),
        sa.Column("finished_at", DT),
        sa.Column("failure", sa.JSON),
        sa.ForeignKeyConstraint(
            ["job_id"], ["jobs.id"], name="fk_runs_job_id_jobs", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("job_id", "attempt", name="uq_runs_job_id"),
    )
    op.create_index("ix_runs_job_id", "runs", ["job_id"])
    if op.get_bind().dialect.name == "postgresql":
        op.create_foreign_key(
            "fk_artifacts_latest_version",
            "artifacts",
            "artifact_versions",
            ["latest_version_id"],
            ["id"],
        )
        op.create_foreign_key(
            "fk_artifacts_approved_version",
            "artifacts",
            "artifact_versions",
            ["approved_version_id"],
            ["id"],
        )
        op.create_foreign_key("fk_jobs_active_run", "jobs", "runs", ["active_run_id"], ["id"])
        op.create_foreign_key(
            "fk_jobs_result_version",
            "jobs",
            "artifact_versions",
            ["result_artifact_version_id"],
            ["id"],
        )
        op.create_foreign_key(
            "fk_artifact_versions_run", "artifact_versions", "runs", ["run_id"], ["id"]
        )
    op.create_table(
        "artifact_dependencies",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("child_version_id", S(36), nullable=False),
        sa.Column("parent_version_id", S(36), nullable=False),
        sa.Column("role", S(50), nullable=False),
        sa.ForeignKeyConstraint(
            ["child_version_id"],
            ["artifact_versions.id"],
            name="fk_artifact_dependencies_child_version_id_artifact_versions",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_version_id"],
            ["artifact_versions.id"],
            name="fk_artifact_dependencies_parent_version_id_artifact_versions",
        ),
        sa.UniqueConstraint(
            "child_version_id",
            "parent_version_id",
            "role",
            name="uq_artifact_dependencies_child_version_id",
        ),
    )
    op.create_index(
        "ix_artifact_dependencies_child_version_id", "artifact_dependencies", ["child_version_id"]
    )
    op.create_index(
        "ix_artifact_dependencies_parent_version_id", "artifact_dependencies", ["parent_version_id"]
    )
    op.create_table(
        "sources",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("project_id", S(36), nullable=False),
        sa.Column("artifact_id", S(36)),
        sa.Column("version_id", S(36)),
        sa.Column("filename", S(500), nullable=False),
        sa.Column("source_kind", S(40), nullable=False),
        sa.Column("media_type", S(200), nullable=False),
        sa.Column("size_bytes", sa.Integer),
        sa.Column("status", S(20), nullable=False),
        sa.Column("object_key", S(1000), nullable=False),
        sa.Column("upload_lease_id", S(36), nullable=False),
        sa.Column("command_identity", S(64), nullable=False),
        sa.Column("request_metadata_hash", S(64), nullable=False),
        sa.Column("byte_hash", S(64)),
        sa.Column("failure", sa.JSON),
        sa.Column("created_at", DT, nullable=False),
        sa.Column("updated_at", DT, nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_sources_project_id_projects",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["artifact_id"], ["artifacts.id"], name="fk_sources_artifact_id_artifacts"
        ),
        sa.ForeignKeyConstraint(
            ["version_id"], ["artifact_versions.id"], name="fk_sources_version_id_artifact_versions"
        ),
        sa.UniqueConstraint("project_id", "command_identity", name="uq_sources_project_id"),
    )
    op.create_index("ix_sources_project_id", "sources", ["project_id"])
    op.create_table(
        "job_inputs",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("job_id", S(36), nullable=False),
        sa.Column("version_id", S(36), nullable=False),
        sa.Column("role", S(50), nullable=False),
        sa.ForeignKeyConstraint(
            ["job_id"], ["jobs.id"], name="fk_job_inputs_job_id_jobs", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["version_id"],
            ["artifact_versions.id"],
            name="fk_job_inputs_version_id_artifact_versions",
        ),
        sa.UniqueConstraint("job_id", "version_id", "role", name="uq_job_inputs_job_id"),
    )
    op.create_index("ix_job_inputs_job_id", "job_inputs", ["job_id"])
    op.create_table(
        "evaluations",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("artifact_version_id", S(36), nullable=False),
        sa.Column("evaluator", S(100), nullable=False),
        sa.Column("decision", S(30), nullable=False),
        sa.Column("checks", sa.JSON, nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("created_at", DT, nullable=False),
        sa.ForeignKeyConstraint(
            ["artifact_version_id"],
            ["artifact_versions.id"],
            name="fk_evaluations_artifact_version_id_artifact_versions",
        ),
    )
    op.create_index("ix_evaluations_artifact_version_id", "evaluations", ["artifact_version_id"])
    op.create_table(
        "approval_decisions",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("artifact_id", S(36), nullable=False),
        sa.Column("version_id", S(36), nullable=False),
        sa.Column("decision", S(20), nullable=False),
        sa.Column("note", sa.Text),
        sa.Column("actor_id", S(100), nullable=False),
        sa.Column("created_at", DT, nullable=False),
        sa.ForeignKeyConstraint(
            ["artifact_id"], ["artifacts.id"], name="fk_approval_decisions_artifact_id_artifacts"
        ),
        sa.ForeignKeyConstraint(
            ["version_id"],
            ["artifact_versions.id"],
            name="fk_approval_decisions_version_id_artifact_versions",
        ),
    )
    op.create_index("ix_approval_decisions_artifact_id", "approval_decisions", ["artifact_id"])
    op.create_index("ix_approval_decisions_version_id", "approval_decisions", ["version_id"])
    op.create_table(
        "usage_records",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("job_id", S(36), nullable=False),
        sa.Column("run_id", S(36), nullable=False),
        sa.Column("artifact_version_id", S(36)),
        sa.Column("provider", S(80), nullable=False),
        sa.Column("operation", S(80), nullable=False),
        sa.Column("model", S(100)),
        sa.Column("input_tokens", sa.Integer),
        sa.Column("output_tokens", sa.Integer),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("estimated_cost_usd", sa.Numeric(12, 6), nullable=False),
        sa.Column("created_at", DT, nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], name="fk_usage_records_job_id_jobs"),
        sa.ForeignKeyConstraint(["run_id"], ["runs.id"], name="fk_usage_records_run_id_runs"),
    )
    op.create_index("ix_usage_records_job_id", "usage_records", ["job_id"])
    op.create_index("ix_usage_records_run_id", "usage_records", ["run_id"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""
        CREATE FUNCTION reject_artifact_version_mutation() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'artifact_versions are immutable'; END; $$ LANGUAGE plpgsql;
        """)
        op.execute("""
        CREATE TRIGGER artifact_versions_no_update_delete
        BEFORE UPDATE OR DELETE ON artifact_versions
        FOR EACH ROW EXECUTE FUNCTION reject_artifact_version_mutation();
        """)


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER artifact_versions_no_update_delete ON artifact_versions")
        op.execute("DROP FUNCTION reject_artifact_version_mutation()")
    for table in [
        "usage_records",
        "approval_decisions",
        "evaluations",
        "job_inputs",
        "sources",
        "artifact_dependencies",
    ]:
        op.drop_table(table)
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint("fk_artifact_versions_run", "artifact_versions", type_="foreignkey")
        op.drop_constraint("fk_jobs_result_version", "jobs", type_="foreignkey")
        op.drop_constraint("fk_jobs_active_run", "jobs", type_="foreignkey")
        op.drop_constraint("fk_artifacts_approved_version", "artifacts", type_="foreignkey")
        op.drop_constraint("fk_artifacts_latest_version", "artifacts", type_="foreignkey")
    for table in [
        "runs",
        "artifact_versions",
        "project_events",
        "jobs",
        "artifacts",
        "outbox_events",
        "idempotency_records",
        "projects",
    ]:
        op.drop_table(table)
