"""Tests for the relevance filter agent."""

import pytest
from curate_ai.agents.schemas import TopicCandidate
from curate_ai.agents.relevance_filter import apply_heuristic_filters


class TestHeuristicFilters:
    """Tests for heuristic filtering logic."""

    def test_rejects_hype_content(self):
        """Test that content with multiple hype indicators is rejected."""
        topic = TopicCandidate(
            title="Revolutionary game-changing breakthrough in AI",
            source="Hype Blog",
            source_type="blog",
            url="https://example.com",
            summary="This incredible, unprecedented, amazing discovery will disrupt everything.",
        )
        should_reject, reason = apply_heuristic_filters(topic)
        assert should_reject is True
        assert "hype" in reason.lower()

    def test_accepts_normal_content(self):
        """Test that normal technical content passes."""
        topic = TopicCandidate(
            title="Improving Transformer Efficiency with Sparse Attention",
            source="arXiv",
            source_type="research",
            url="https://arxiv.org/abs/1234.5678",
            summary="We present a new method for reducing the computational complexity of attention mechanisms in transformer models.",
        )
        should_reject, reason = apply_heuristic_filters(topic)
        assert should_reject is False
        assert reason is None

    def test_rejects_short_summary(self):
        """Test that content with very short summary is rejected."""
        topic = TopicCandidate(
            title="Short AI Paper",
            source="arXiv",
            source_type="research",
            url="https://arxiv.org/abs/1234.5678",
            summary="Too short",  # Less than 50 chars
        )
        should_reject, reason = apply_heuristic_filters(topic)
        assert should_reject is True
        assert "insufficient" in reason.lower()

    def test_rejects_non_ai_content(self):
        """Test that non-AI content is rejected."""
        topic = TopicCandidate(
            title="New Features in JavaScript Framework",
            source="Tech Blog",
            source_type="blog",
            url="https://example.com",
            summary="This blog post covers the latest features in a popular JavaScript framework for web development.",
        )
        should_reject, reason = apply_heuristic_filters(topic)
        assert should_reject is True
        assert "not ai/ml" in reason.lower()

    def test_accepts_ai_content(self):
        """Test that AI-related content passes."""
        topic = TopicCandidate(
            title="New LLM Training Techniques",
            source="Research Blog",
            source_type="blog",
            url="https://example.com",
            summary="This paper presents novel techniques for training large language models with improved efficiency and performance.",
        )
        should_reject, reason = apply_heuristic_filters(topic)
        assert should_reject is False
