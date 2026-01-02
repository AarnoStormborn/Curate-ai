"""Initial schema

Revision ID: 001
Revises: 
Create Date: 2026-01-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Create agent_runs table
    op.create_table(
        "agent_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), default="running"),
        sa.Column("config_hash", sa.String(64), nullable=True),
        sa.Column("duration_seconds", sa.Float, nullable=True),
        sa.Column("metadata", postgresql.JSON, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
    )

    # Create topics_seen table
    op.create_table(
        "topics_seen",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agent_runs.id")),
        sa.Column("title", sa.String(500)),
        sa.Column("source", sa.String(100)),
        sa.Column("source_type", sa.String(50)),
        sa.Column("url", sa.String(2000)),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("discovered_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("relevance_score", sa.Float, nullable=True),
        sa.Column("novelty_score", sa.Float, nullable=True),
        sa.Column("impact_score", sa.Float, nullable=True),
        sa.Column("combined_score", sa.Float, nullable=True),
        sa.Column("embedding", Vector(768), nullable=True),
    )

    # Create angles_generated table
    op.create_table(
        "angles_generated",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agent_runs.id")),
        sa.Column("topic_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("topics_seen.id")),
        sa.Column("stance", sa.Text),
        sa.Column("why_it_matters", sa.Text),
        sa.Column("second_order_effects", postgresql.JSON),
        sa.Column("relevant_for", postgresql.JSON),
        sa.Column("confidence", sa.Float),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("embedding", Vector(768), nullable=True),
        sa.Column("is_selected", sa.Boolean, default=False),
    )

    # Create angle_scores table
    op.create_table(
        "angle_scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("angle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("angles_generated.id")),
        sa.Column("score_type", sa.String(50)),
        sa.Column("score_value", sa.Float),
        sa.Column("scored_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("metadata", postgresql.JSON, nullable=True),
    )

    # Create rejected_items table
    op.create_table(
        "rejected_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agent_runs.id")),
        sa.Column("item_type", sa.String(50)),
        sa.Column("item_id", postgresql.UUID(as_uuid=True)),
        sa.Column("rejection_reason", sa.Text),
        sa.Column("rejection_stage", sa.String(50)),
        sa.Column("rejected_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("metadata", postgresql.JSON, nullable=True),
    )

    # Create emails_sent table
    op.create_table(
        "emails_sent",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agent_runs.id")),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("recipient", sa.String(500)),
        sa.Column("subject", sa.String(500)),
        sa.Column("angle_ids", postgresql.JSON),
        sa.Column("email_hash", sa.String(64), nullable=True),
        sa.Column("success", sa.Boolean, default=True),
        sa.Column("error_message", sa.Text, nullable=True),
    )

    # Create indexes
    op.create_index("ix_topics_url", "topics_seen", ["url"])
    op.create_index("ix_topics_run_id", "topics_seen", ["run_id"])
    op.create_index("ix_angles_run_id", "angles_generated", ["run_id"])
    op.create_index("ix_angles_topic_id", "angles_generated", ["topic_id"])


def downgrade() -> None:
    op.drop_table("emails_sent")
    op.drop_table("rejected_items")
    op.drop_table("angle_scores")
    op.drop_table("angles_generated")
    op.drop_table("topics_seen")
    op.drop_table("agent_runs")
    op.execute("DROP EXTENSION IF EXISTS vector")
