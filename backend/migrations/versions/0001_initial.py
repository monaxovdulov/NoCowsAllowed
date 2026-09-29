"""initial: player, gamesession, scorerun

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-29

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "player",
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=False),
        sa.Column("first_name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("last_name", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("username", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("best_score", sa.Integer(), nullable=False),
        sa.Column("runs", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("telegram_user_id"),
    )
    op.create_table(
        "gamesession",
        sa.Column("nonce", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=False),
        sa.Column("chat_id", sa.BigInteger(), nullable=True),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column(
            "inline_message_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
        sa.Column("issued_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["telegram_user_id"], ["player.telegram_user_id"]),
        sa.PrimaryKeyConstraint("nonce"),
    )
    op.create_index(
        "ix_gamesession_telegram_user_id",
        "gamesession",
        ["telegram_user_id"],
    )
    op.create_table(
        "scorerun",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=False),
        sa.Column("session_nonce", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column(
            "via",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["telegram_user_id"], ["player.telegram_user_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scorerun_telegram_user_id", "scorerun", ["telegram_user_id"])
    op.create_index("ix_scorerun_session_nonce", "scorerun", ["session_nonce"])
    op.create_index("ix_scorerun_created_at", "scorerun", ["created_at"])


def downgrade() -> None:
    op.drop_table("scorerun")
    op.drop_table("gamesession")
    op.drop_table("player")
