"""run stats: distance_m, duration_s, crash_reason, max_mult на scorerun

Revision ID: 0002_run_stats
Revises: 0001_initial
Create Date: 2026-10-02

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_run_stats"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("scorerun", sa.Column("distance_m", sa.Integer(), nullable=True))
    op.add_column("scorerun", sa.Column("duration_s", sa.Integer(), nullable=True))
    op.add_column(
        "scorerun",
        sa.Column("crash_reason", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.add_column("scorerun", sa.Column("max_mult", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("scorerun", "max_mult")
    op.drop_column("scorerun", "crash_reason")
    op.drop_column("scorerun", "duration_s")
    op.drop_column("scorerun", "distance_m")
