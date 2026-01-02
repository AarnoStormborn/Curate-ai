"""Redundancy Checker Agent - Uses semantic memory to detect and penalize repeated themes."""

from curate_ai.agents.schemas import InsightAngle
from curate_ai.config import get_settings
from curate_ai.logging import get_logger

logger = get_logger(__name__)


async def compute_embedding(text: str) -> list[float]:
    """
    Compute embedding for text using the configured embedding model.
    
    In production, this would call the Gemini embedding API.
    Returns a 768-dimensional vector.
    """
    # Placeholder - will be replaced with actual embedding call
    import hashlib
    # Generate deterministic pseudo-embedding from text hash
    hash_bytes = hashlib.sha256(text.encode()).digest()
    # Expand to 768 dimensions (simplified placeholder)
    embedding = []
    for i in range(768):
        byte_idx = i % 32
        embedding.append((hash_bytes[byte_idx] / 255.0) - 0.5)
    return embedding


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    dot_product = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot_product / (norm_a * norm_b)


async def check_redundancy(
    angle: InsightAngle,
    prior_embeddings: list[list[float]],
    threshold: float | None = None,
) -> tuple[bool, float, str | None]:
    """
    Check if an angle is redundant against prior angles.
    
    Args:
        angle: The insight angle to check
        prior_embeddings: List of embeddings from prior angles
        threshold: Similarity threshold (default from config)
    
    Returns:
        Tuple of (is_redundant, max_similarity, reason)
    """
    settings = get_settings()
    if threshold is None:
        threshold = settings.similarity_threshold

    # Compute embedding for this angle
    angle_text = f"{angle.stance} {angle.why_it_matters}"
    angle_embedding = await compute_embedding(angle_text)

    if not prior_embeddings:
        return False, 0.0, None

    # Find maximum similarity with any prior angle
    max_sim = 0.0
    for prior_emb in prior_embeddings:
        sim = cosine_similarity(angle_embedding, prior_emb)
        max_sim = max(max_sim, sim)

    is_redundant = max_sim >= threshold
    reason = None
    if is_redundant:
        reason = f"Too similar to prior angle (similarity: {max_sim:.2f} >= {threshold})"

    return is_redundant, max_sim, reason


async def deduplicate_angles(
    angles: list[InsightAngle],
    prior_embeddings: list[list[float]] | None = None,
) -> tuple[list[InsightAngle], list[tuple[InsightAngle, str]]]:
    """
    Remove redundant angles from the list.
    
    This performs both:
    1. Cross-run deduplication (against prior_embeddings from DB)
    2. Within-run deduplication (against other angles in this batch)
    
    Args:
        angles: List of insight angles to deduplicate
        prior_embeddings: Embeddings from database of prior angles
    
    Returns:
        Tuple of (deduplicated_angles, rejected_with_reasons)
    """
    settings = get_settings()
    threshold = settings.similarity_threshold

    if prior_embeddings is None:
        prior_embeddings = []

    deduplicated: list[InsightAngle] = []
    rejected: list[tuple[InsightAngle, str]] = []
    current_embeddings: list[list[float]] = list(prior_embeddings)

    for angle in angles:
        is_redundant, similarity, reason = await check_redundancy(
            angle, current_embeddings, threshold
        )

        if is_redundant:
            rejected.append((angle, reason or "Redundant angle"))
            logger.debug(
                "Rejected redundant angle",
                stance=angle.stance[:50],
                similarity=similarity,
            )
        else:
            deduplicated.append(angle)
            # Add this angle's embedding to check against subsequent angles
            angle_text = f"{angle.stance} {angle.why_it_matters}"
            embedding = await compute_embedding(angle_text)
            current_embeddings.append(embedding)

    logger.info(
        "Deduplicated angles",
        input_count=len(angles),
        kept=len(deduplicated),
        rejected=len(rejected),
    )

    return deduplicated, rejected
