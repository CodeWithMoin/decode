"""Add durable run-scoped production task graphs."""

import sqlalchemy as sa
from alembic import op

revision = "0005_production_task_graph"
down_revision = "0004_project_auto_continue"
branch_labels = None
depends_on = None

S = sa.String
DT = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.add_column(
        "outbox_events",
        sa.Column("priority", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_table(
        "production_tasks",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("run_id", S(36), nullable=False),
        sa.Column("kind", S(60), nullable=False),
        sa.Column("stable_key", S(100), nullable=False),
        sa.Column("status", S(20), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("input", sa.JSON(), nullable=False),
        sa.Column("output", sa.JSON()),
        sa.Column("failure", sa.JSON()),
        sa.Column("created_at", DT, nullable=False),
        sa.Column("started_at", DT),
        sa.Column("finished_at", DT),
        sa.ForeignKeyConstraint(
            ["run_id"], ["runs.id"], name="fk_production_tasks_run_id_runs", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("run_id", "stable_key", name="uq_production_tasks_run_id"),
    )
    op.create_index("ix_production_tasks_run_id", "production_tasks", ["run_id"])
    op.create_index("ix_production_tasks_kind", "production_tasks", ["kind"])
    op.create_index("ix_production_tasks_status", "production_tasks", ["status"])
    op.create_table(
        "production_task_dependencies",
        sa.Column("id", S(36), primary_key=True),
        sa.Column("task_id", S(36), nullable=False),
        sa.Column("prerequisite_task_id", S(36), nullable=False),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["production_tasks.id"],
            name="fk_task_dependencies_task",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["prerequisite_task_id"],
            ["production_tasks.id"],
            name="fk_task_dependencies_prerequisite",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "task_id",
            "prerequisite_task_id",
            name="uq_task_dependencies_edge",
        ),
    )
    op.create_index(
        "ix_production_task_dependencies_task_id",
        "production_task_dependencies",
        ["task_id"],
    )
    op.create_index(
        "ix_production_task_dependencies_prerequisite_task_id",
        "production_task_dependencies",
        ["prerequisite_task_id"],
    )


def downgrade() -> None:
    op.drop_table("production_task_dependencies")
    op.drop_table("production_tasks")
    op.drop_column("outbox_events", "priority")
