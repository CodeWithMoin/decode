"""Let a project run its stages back to back.

Approving an artifact used to move a pointer and stop, so reaching a script took
three separate requests with a human wait between each. The artifacts stay
separate — that is what keeps a structural edit cheap — but the *stop* between
them is now a per-project choice rather than a fact of the pipeline.

TRUE for existing projects: they were all created by a creator who wanted a
video, and the alternative default is a studio that silently does nothing after
the brief.
"""

import sqlalchemy as sa
from alembic import op

revision = "0004_project_auto_continue"
down_revision = "0003_usage_cost_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("auto_continue", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    op.drop_column("projects", "auto_continue")
