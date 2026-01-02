"""Tests for redundancy checker agent."""

import pytest
from curate_ai.agents.redundancy_checker import (
    cosine_similarity,
    compute_embedding,
)


class TestCosineSimilarity:
    """Tests for cosine similarity calculation."""

    def test_identical_vectors(self):
        """Test similarity of identical vectors is 1.0."""
        vec = [0.1, 0.2, 0.3, 0.4, 0.5]
        sim = cosine_similarity(vec, vec)
        assert abs(sim - 1.0) < 0.0001

    def test_orthogonal_vectors(self):
        """Test similarity of orthogonal vectors is 0.0."""
        vec1 = [1.0, 0.0, 0.0]
        vec2 = [0.0, 1.0, 0.0]
        sim = cosine_similarity(vec1, vec2)
        assert abs(sim) < 0.0001

    def test_similar_vectors(self):
        """Test similarity of similar vectors is high."""
        vec1 = [0.1, 0.2, 0.3, 0.4]
        vec2 = [0.15, 0.25, 0.35, 0.45]  # Similar to vec1
        sim = cosine_similarity(vec1, vec2)
        assert sim > 0.99  # Very similar

    def test_different_vectors(self):
        """Test similarity of different vectors is lower."""
        vec1 = [1.0, 0.0, 0.0, 0.0]
        vec2 = [0.0, 0.0, 0.0, 1.0]
        sim = cosine_similarity(vec1, vec2)
        assert sim < 0.1  # Very different

    def test_zero_vector(self):
        """Test handling of zero vectors."""
        vec1 = [0.0, 0.0, 0.0]
        vec2 = [0.1, 0.2, 0.3]
        sim = cosine_similarity(vec1, vec2)
        assert sim == 0.0


@pytest.mark.asyncio
async def test_compute_embedding():
    """Test embedding computation returns correct dimensions."""
    text = "This is a test sentence for embedding."
    embedding = await compute_embedding(text)
    assert len(embedding) == 768  # Expected dimension


@pytest.mark.asyncio
async def test_embeddings_deterministic():
    """Test that same text produces same embedding."""
    text = "Consistent text for testing."
    embedding1 = await compute_embedding(text)
    embedding2 = await compute_embedding(text)
    assert embedding1 == embedding2


@pytest.mark.asyncio
async def test_different_texts_different_embeddings():
    """Test that different texts produce different embeddings."""
    text1 = "First unique sentence."
    text2 = "Completely different content."
    embedding1 = await compute_embedding(text1)
    embedding2 = await compute_embedding(text2)
    # Embeddings should be different
    assert embedding1 != embedding2
