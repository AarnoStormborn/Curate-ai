"""Tests for agent schemas."""

import pytest
from datetime import datetime

from curate_ai.agents.schemas import (
    TopicCandidate,
    ScoredTopic,
    InsightAngle,
    CuratedAsset,
    FinalAngle,
    EmailBrief,
    PipelineContext,
)


class TestTopicCandidate:
    """Tests for TopicCandidate schema."""

    def test_create_minimal(self):
        """Test creating topic with minimal required fields."""
        topic = TopicCandidate(
            title="Test Paper",
            source="arXiv",
            source_type="research",
            url="https://arxiv.org/abs/1234.5678",
            summary="This is a test summary.",
        )
        assert topic.title == "Test Paper"
        assert topic.source == "arXiv"
        assert topic.source_type == "research"
        assert topic.id is not None

    def test_create_full(self):
        """Test creating topic with all fields."""
        now = datetime.utcnow()
        topic = TopicCandidate(
            title="Full Paper",
            source="OpenAI Blog",
            source_type="blog",
            url="https://openai.com/blog/test",
            summary="Full summary here.",
            published_at=now,
            authors=["Author 1", "Author 2"],
            tags=["llm", "gpt"],
        )
        assert topic.published_at == now
        assert len(topic.authors) == 2
        assert "llm" in topic.tags


class TestScoredTopic:
    """Tests for ScoredTopic schema."""

    def test_scores_validation(self):
        """Test score value validation."""
        topic = ScoredTopic(
            title="Test",
            source="arXiv",
            source_type="research",
            url="https://test.com",
            summary="Test",
            relevance_score=0.8,
            novelty_score=0.7,
            impact_score=0.9,
            combined_score=0.8,
        )
        assert topic.relevance_score == 0.8
        assert not topic.is_rejected

    def test_rejected_topic(self):
        """Test rejected topic with reason."""
        topic = ScoredTopic(
            title="Rejected",
            source="Blog",
            source_type="blog",
            url="https://test.com",
            summary="Test",
            relevance_score=0.1,
            novelty_score=0.1,
            impact_score=0.1,
            combined_score=0.1,
            rejection_reason="Too much hype",
            is_rejected=True,
        )
        assert topic.is_rejected
        assert topic.rejection_reason == "Too much hype"

    def test_score_out_of_range(self):
        """Test that scores outside 0-1 are rejected."""
        with pytest.raises(ValueError):
            ScoredTopic(
                title="Test",
                source="arXiv",
                source_type="research",
                url="https://test.com",
                summary="Test",
                relevance_score=1.5,  # Invalid
                novelty_score=0.5,
                impact_score=0.5,
                combined_score=0.5,
            )


class TestInsightAngle:
    """Tests for InsightAngle schema."""

    def test_create_angle(self):
        """Test creating an insight angle."""
        angle = InsightAngle(
            topic_id="topic-123",
            stance="This is a strong opinionated stance on the topic.",
            why_it_matters="This matters because it changes how we think about X.",
            second_order_effects=["Effect 1", "Effect 2"],
            relevant_for=["ML engineers", "Researchers"],
            confidence=0.85,
        )
        assert angle.topic_id == "topic-123"
        assert len(angle.second_order_effects) == 2
        assert angle.confidence == 0.85

    def test_angle_requires_effects(self):
        """Test that second_order_effects requires at least one item."""
        with pytest.raises(ValueError):
            InsightAngle(
                topic_id="topic-123",
                stance="Test stance",
                why_it_matters="Test why",
                second_order_effects=[],  # Empty - should fail
                relevant_for=["Developers"],
                confidence=0.5,
            )


class TestFinalAngle:
    """Tests for FinalAngle schema."""

    def test_insight_length_limit(self):
        """Test that insight is limited to 200 chars."""
        # This should work
        angle = FinalAngle(
            insight="A" * 200,
            why_it_matters="Test",
            relevant_for=["Test"],
            framing_points=["Point 1", "Point 2"],
            confidence=0.5,
            original_topic_title="Test Topic",
        )
        assert len(angle.insight) == 200

        # This should fail
        with pytest.raises(ValueError):
            FinalAngle(
                insight="A" * 201,  # Too long
                why_it_matters="Test",
                relevant_for=["Test"],
                framing_points=["Point 1", "Point 2"],
                confidence=0.5,
                original_topic_title="Test Topic",
            )


class TestEmailBrief:
    """Tests for EmailBrief schema."""

    def test_create_brief(self):
        """Test creating an email brief."""
        angle = FinalAngle(
            insight="Test insight",
            why_it_matters="Test why",
            relevant_for=["Developers"],
            framing_points=["Point 1", "Point 2"],
            confidence=0.8,
            original_topic_title="Test Topic",
        )
        brief = EmailBrief(
            run_id="run-123",
            angles=[angle],
            topics_considered=100,
            topics_filtered=10,
            angles_generated=5,
        )
        assert brief.run_id == "run-123"
        assert len(brief.angles) == 1
        assert brief.topics_considered == 100

    def test_brief_requires_angles(self):
        """Test that brief requires at least one angle."""
        with pytest.raises(ValueError):
            EmailBrief(
                run_id="run-123",
                angles=[],  # Empty
                topics_considered=10,
                topics_filtered=5,
                angles_generated=0,
            )


class TestPipelineContext:
    """Tests for PipelineContext schema."""

    def test_default_values(self):
        """Test pipeline context default values."""
        ctx = PipelineContext()
        assert ctx.run_id is not None
        assert ctx.dry_run is False
        assert ctx.debug is False
        assert ctx.topics == []
        assert ctx.email_brief is None

    def test_custom_values(self):
        """Test pipeline context with custom values."""
        ctx = PipelineContext(
            run_id="custom-run",
            dry_run=True,
            debug=True,
        )
        assert ctx.run_id == "custom-run"
        assert ctx.dry_run is True
