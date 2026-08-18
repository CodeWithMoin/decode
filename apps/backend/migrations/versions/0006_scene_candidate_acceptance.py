"""Pause generated scene candidates for explicit creator acceptance."""

import sqlalchemy as sa
from alembic import op

revision = "0006_scene_candidate_acceptance"
down_revision = "0005_production_task_graph"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "production_tasks",
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Runs completed under the old auto-assembly policy must not become blocked.
    op.execute(
        """
        UPDATE production_tasks
        SET accepted_at = finished_at
        WHERE kind = 'design_scene' AND status = 'succeeded'
        """
    )


def downgrade() -> None:
    op.drop_column("production_tasks", "accepted_at")
