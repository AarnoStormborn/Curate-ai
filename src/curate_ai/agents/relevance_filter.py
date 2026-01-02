"""Relevance Filter Agent - Scores and filters topics based on relevance, novelty, and impact."""

from pydantic import BaseModel, Field

from curate_ai.agents.schemas import ScoredTopic, TopicCandidate
from curate_ai.config import get_settings
from curate_ai.logging import get_logger

logger = get_logger(__name__)

# Keywords that indicate hype/marketing content to penalize
HYPE_INDICATORS = [
    "revolutionary", "game-changing", "disrupting", "unprecedented",
    "breakthrough", "magic", "secret", "exclusive", "limited time",
    "you won't believe", "amazing", "incredible", "unbelievable",
]

# Keywords that indicate practical relevance
PRACTICAL_INDICATORS = [
    "benchmark", "performance", "latency", "throughput", "accuracy",
    "implementation", "code", "open source", "api", "sdk",
    "tutorial", "guide", "how to", "production", "deployment",
]


class TopicScoreOutput(BaseModel):
    """Structured output for topic scoring."""

    relevance_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="How relevant is this for AI/ML practitioners? (0-1)"
    )
    novelty_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="How novel/fresh is this content? (0-1)"
    )
    impact_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="What is the long-term impact potential? (0-1)"
    )
    is_hype: bool = Field(
        ..., description="Is this primarily marketing/hype content?"
    )
    is_duplicate_concept: bool = Field(
        ..., description="Does this cover a concept that's been widely discussed?"
    )
    rejection_reason: str | None = Field(
        None, description="If scores are low, why?"
    )
    reasoning: str = Field(
        ..., description="Brief reasoning for the scores"
    )


def apply_heuristic_filters(topic: TopicCandidate) -> tuple[bool, str | None]:
    """
    Apply quick heuristic filters before LLM scoring.
    
    Returns:
        Tuple of (should_reject, rejection_reason)
    """
    title_lower = topic.title.lower()
    summary_lower = topic.summary.lower()
    combined = f"{title_lower} {summary_lower}"

    # Check for hype indicators
    hype_count = sum(1 for h in HYPE_INDICATORS if h in combined)
    if hype_count >= 3:
        return True, f"High hype content (matched {hype_count} hype indicators)"

    # Check for empty/minimal content
    if len(topic.summary) < 50:
        return True, "Insufficient summary content"

    # Check for non-AI/ML content that slipped through
    ai_keywords = ["ai", "ml", "machine learning", "neural", "llm", "transformer", "model"]
    if not any(kw in combined for kw in ai_keywords):
        return True, "Not AI/ML related content"

    return False, None


async def score_topic(topic: TopicCandidate) -> ScoredTopic:
    """
    Score a single topic using LLM-based evaluation.
    
    This function would be called by the agent to evaluate each topic.
    """
    # Apply heuristic filters first
    should_reject, reason = apply_heuristic_filters(topic)
    if should_reject:
        return ScoredTopic(
            **topic.model_dump(),
            relevance_score=0.0,
            novelty_score=0.0,
            impact_score=0.0,
            combined_score=0.0,
            rejection_reason=reason,
            is_rejected=True,
        )

    # Calculate practical relevance boost
    practical_boost = sum(
        0.05 for p in PRACTICAL_INDICATORS
        if p in f"{topic.title} {topic.summary}".lower()
    )
    practical_boost = min(practical_boost, 0.2)

    # Default scores (will be overridden by LLM in actual agent call)
    # These are placeholders for the tool function
    return ScoredTopic(
        **topic.model_dump(),
        relevance_score=0.5 + practical_boost,
        novelty_score=0.5,
        impact_score=0.5,
        combined_score=0.5 + practical_boost,
        rejection_reason=None,
        is_rejected=False,
    )


async def filter_topics(
    topics: list[TopicCandidate],
    min_combined_score: float = 0.4,
    max_topics: int = 15,
) -> list[ScoredTopic]:
    """
    Filter and score a list of topics.
    
    Args:
        topics: List of candidate topics
        min_combined_score: Minimum score threshold
        max_topics: Maximum number of topics to return
    
    Returns:
        Filtered and scored topics, sorted by combined score
    """
    scored: list[ScoredTopic] = []
    rejected_count = 0

    for topic in topics:
        scored_topic = await score_topic(topic)
        if scored_topic.is_rejected:
            rejected_count += 1
            logger.debug(
                "Rejected topic",
                title=topic.title[:50],
                reason=scored_topic.rejection_reason,
            )
        else:
            scored.append(scored_topic)

    # Filter by minimum score
    filtered = [t for t in scored if t.combined_score >= min_combined_score]

    # Sort by combined score and take top N
    filtered.sort(key=lambda t: t.combined_score, reverse=True)
    result = filtered[:max_topics]

    logger.info(
        "Filtered topics",
        input_count=len(topics),
        rejected=rejected_count,
        passed_threshold=len(filtered),
        returned=len(result),
    )

    return result
