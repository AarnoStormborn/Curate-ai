"""Repository layer for data access operations."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from curate_ai.db.models import (
    AgentRun,
    AngleGenerated,
    AngleScore,
    EmailSent,
    RejectedItem,
    TopicSeen,
)


class AgentRunRepository:
    """Repository for agent run operations."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        config_hash: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AgentRun:
        """Create a new agent run record."""
        run = AgentRun(
            config_hash=config_hash,
            metadata_=metadata,
            status="running",
        )
        self.session.add(run)
        await self.session.flush()
        return run

    async def get(self, run_id: uuid.UUID) -> AgentRun | None:
        """Get an agent run by ID."""
        result = await self.session.execute(
            select(AgentRun).where(AgentRun.id == run_id)
        )
        return result.scalar_one_or_none()

    async def complete(
        self,
        run_id: uuid.UUID,
        duration_seconds: float,
        error_message: str | None = None,
    ) -> None:
        """Mark a run as completed or failed."""
        status = "failed" if error_message else "completed"
        await self.session.execute(
            update(AgentRun)
            .where(AgentRun.id == run_id)
            .values(
                status=status,
                completed_at=datetime.utcnow(),
                duration_seconds=duration_seconds,
                error_message=error_message,
            )
        )

    async def get_recent_runs(self, limit: int = 10) -> list[AgentRun]:
        """Get the most recent runs."""
        result = await self.session.execute(
            select(AgentRun)
            .order_by(AgentRun.started_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())


class TopicRepository:
    """Repository for topic operations."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        run_id: uuid.UUID,
        title: str,
        source: str,
        source_type: str,
        url: str,
        summary: str | None = None,
        published_at: datetime | None = None,
    ) -> TopicSeen:
        """Create a new topic record."""
        topic = TopicSeen(
            run_id=run_id,
            title=title,
            source=source,
            source_type=source_type,
            url=url,
            summary=summary,
            published_at=published_at,
        )
        self.session.add(topic)
        await self.session.flush()
        return topic

    async def bulk_create(
        self,
        topics: list[dict[str, Any]],
    ) -> list[TopicSeen]:
        """Create multiple topics at once."""
        created = []
        for topic_data in topics:
            topic = TopicSeen(**topic_data)
            self.session.add(topic)
            created.append(topic)
        await self.session.flush()
        return created

    async def get_by_url(self, url: str) -> TopicSeen | None:
        """Check if a topic with this URL already exists."""
        result = await self.session.execute(
            select(TopicSeen).where(TopicSeen.url == url)
        )
        return result.scalar_one_or_none()

    async def update_scores(
        self,
        topic_id: uuid.UUID,
        relevance_score: float,
        novelty_score: float,
        impact_score: float,
        embedding: list[float] | None = None,
    ) -> None:
        """Update topic scores after relevance filtering."""
        combined = (relevance_score + novelty_score + impact_score) / 3
        values: dict[str, Any] = {
            "relevance_score": relevance_score,
            "novelty_score": novelty_score,
            "impact_score": impact_score,
            "combined_score": combined,
        }
        if embedding is not None:
            values["embedding"] = embedding

        await self.session.execute(
            update(TopicSeen)
            .where(TopicSeen.id == topic_id)
            .values(**values)
        )

    async def get_similar_topics(
        self,
        embedding: list[float],
        threshold: float = 0.85,
        limit: int = 5,
    ) -> list[TopicSeen]:
        """Find similar topics using vector similarity."""
        # Using pgvector's <=> operator for cosine distance
        result = await self.session.execute(
            select(TopicSeen)
            .where(TopicSeen.embedding.isnot(None))
            .order_by(TopicSeen.embedding.cosine_distance(embedding))
            .limit(limit)
        )
        # Filter by threshold (cosine distance, so lower is more similar)
        topics = list(result.scalars().all())
        return [t for t in topics if self._cosine_similarity(t.embedding, embedding) >= threshold]

    @staticmethod
    def _cosine_similarity(a: list[float] | None, b: list[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        if a is None:
            return 0.0
        dot_product = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot_product / (norm_a * norm_b)


class AngleRepository:
    """Repository for angle operations."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        run_id: uuid.UUID,
        topic_id: uuid.UUID,
        stance: str,
        why_it_matters: str,
        second_order_effects: list[str],
        relevant_for: list[str],
        confidence: float,
        embedding: list[float] | None = None,
    ) -> AngleGenerated:
        """Create a new angle record."""
        angle = AngleGenerated(
            run_id=run_id,
            topic_id=topic_id,
            stance=stance,
            why_it_matters=why_it_matters,
            second_order_effects=second_order_effects,
            relevant_for=relevant_for,
            confidence=confidence,
            embedding=embedding,
        )
        self.session.add(angle)
        await self.session.flush()
        return angle

    async def mark_selected(self, angle_ids: list[uuid.UUID]) -> None:
        """Mark angles as selected for the email."""
        await self.session.execute(
            update(AngleGenerated)
            .where(AngleGenerated.id.in_(angle_ids))
            .values(is_selected=True)
        )

    async def get_similar_angles(
        self,
        embedding: list[float],
        threshold: float = 0.85,
        limit: int = 10,
    ) -> list[AngleGenerated]:
        """Find similar angles using vector similarity."""
        result = await self.session.execute(
            select(AngleGenerated)
            .where(AngleGenerated.embedding.isnot(None))
            .order_by(AngleGenerated.embedding.cosine_distance(embedding))
            .limit(limit)
        )
        angles = list(result.scalars().all())
        return [
            a for a in angles
            if TopicRepository._cosine_similarity(a.embedding, embedding) >= threshold
        ]

    async def add_score(
        self,
        angle_id: uuid.UUID,
        score_type: str,
        score_value: float,
        metadata: dict[str, Any] | None = None,
    ) -> AngleScore:
        """Add a score record for an angle."""
        score = AngleScore(
            angle_id=angle_id,
            score_type=score_type,
            score_value=score_value,
            metadata_=metadata,
        )
        self.session.add(score)
        await self.session.flush()
        return score


class RejectedItemRepository:
    """Repository for rejected items."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        run_id: uuid.UUID,
        item_type: str,
        item_id: uuid.UUID,
        rejection_reason: str,
        rejection_stage: str,
        metadata: dict[str, Any] | None = None,
    ) -> RejectedItem:
        """Create a rejection record."""
        rejected = RejectedItem(
            run_id=run_id,
            item_type=item_type,
            item_id=item_id,
            rejection_reason=rejection_reason,
            rejection_stage=rejection_stage,
            metadata_=metadata,
        )
        self.session.add(rejected)
        await self.session.flush()
        return rejected


class EmailRepository:
    """Repository for email records."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        run_id: uuid.UUID,
        recipient: str,
        subject: str,
        angle_ids: list[uuid.UUID],
        email_hash: str | None = None,
    ) -> EmailSent:
        """Create an email sent record."""
        email = EmailSent(
            run_id=run_id,
            recipient=recipient,
            subject=subject,
            angle_ids=[str(aid) for aid in angle_ids],
            email_hash=email_hash,
        )
        self.session.add(email)
        await self.session.flush()
        return email

    async def mark_failed(
        self,
        email_id: uuid.UUID,
        error_message: str,
    ) -> None:
        """Mark an email as failed."""
        await self.session.execute(
            update(EmailSent)
            .where(EmailSent.id == email_id)
            .values(success=False, error_message=error_message)
        )
