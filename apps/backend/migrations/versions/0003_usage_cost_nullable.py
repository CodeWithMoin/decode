"""Let estimated_cost_usd be unknown.

The column defaulted to 0, which made "this model's price is not on file" and
"this run was free" the same stored value. A deterministic fixture really does
cost nothing, and a real model whose rate nobody has recorded really is unknown;
collapsing the two means the number can never be trusted or summed.

NULL now means unpriced. Rows written before this migration are left at 0
rather than blanked: the fixture runs that produced them genuinely were free,
and rewriting history to say "unknown" would be a second lie.
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_usage_cost_nullable"
down_revision = "0002_project_soft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "usage_records",
        "estimated_cost_usd",
        existing_type=sa.Numeric(12, 6),
        nullable=True,
        server_default=None,
    )


def downgrade() -> None:
    op.execute("UPDATE usage_records SET estimated_cost_usd = 0 WHERE estimated_cost_usd IS NULL")
    op.alter_column(
        "usage_records",
        "estimated_cost_usd",
        existing_type=sa.Numeric(12, 6),
        nullable=False,
    )
