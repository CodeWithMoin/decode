"""Soft-delete projects.

A hard delete is not available: artifact_versions carries a BEFORE DELETE
trigger that rejects every row, so cascading a project delete would abort the
transaction. That trigger is the invariant, not an obstacle — versions are kept
in history — so removal is a pointer change instead.

`deleted_at` rather than a `status` value, because the worker owns `status` and
writes processing/ready/failed as a run progresses. A project deleted while its
job was running would come back.
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_project_soft_delete"
down_revision = "0001_walking_skeleton"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_projects_deleted_at", "projects", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_projects_deleted_at", table_name="projects")
    op.drop_column("projects", "deleted_at")
