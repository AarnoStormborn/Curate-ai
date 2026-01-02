"""Insight Generator Agent - Generates opinionated angles from scored topics."""

from pydantic import BaseModel, Field

from curate_ai.agents.schemas import InsightAngle, ScoredTopic
from curate_ai.logging import get_logger

logger = get_logger(__name__)


class GeneratedInsight(BaseModel):
    """Structured output for a generated insight angle."""

    stance: str = Field(
        ...,
        min_length=20,
        description="Your opinionated take on this topic. Must be a clear position, not neutral."
    )
    why_it_matters: str = Field(
        ...,
        min_length=30,
        description="Why this matters - be specific and avoid generic statements."
    )
    second_order_effects: list[str] = Field(
        ...,
        min_length=2,
        max_length=5,
        description="Downstream implications - what this enables or disrupts."
    )
    relevant_for: list[str] = Field(
        ...,
        min_length=1,
        max_length=4,
        description="Specific audience segments (e.g., 'ML engineers at startups', 'AI product managers')."
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="How confident are you in this angle? (0-1)"
    )
    supporting_evidence: list[str] = Field(
        default_factory=list,
        description="Key evidence points that support your stance."
    )
    is_neutral_take: bool = Field(
        ...,
        description="Flag if this take is too neutral/generic. Should be False for good angles."
    )


async def generate_insight(topic: ScoredTopic) -> InsightAngle:
    """
    Generate an opinionated insight angle from a scored topic.
    
    This tool generates angles that:
    - Take a clear stance (no neutral summaries)
    - Explain why it matters beyond the obvious
    - Identify second-order effects
    - Target specific audiences
    """
    # Placeholder implementation - actual generation happens via LLM
    return InsightAngle(
        topic_id=topic.id,
        stance=f"This development in '{topic.title[:50]}' signals a shift in...",
        why_it_matters="This matters because...",
        second_order_effects=["Effect 1", "Effect 2"],
        relevant_for=["ML engineers", "AI researchers"],
        confidence=topic.combined_score,
        supporting_evidence=[topic.url],
    )


async def generate_angles_batch(
    topics: list[ScoredTopic],
    angles_per_topic: int = 1,
) -> list[InsightAngle]:
    """
    Generate insight angles for multiple topics.
    
    Args:
        topics: Scored topics to generate angles for
        angles_per_topic: Number of angles to generate per topic
    
    Returns:
        List of generated insight angles
    """
    angles: list[InsightAngle] = []

    for topic in topics:
        try:
            for _ in range(angles_per_topic):
                angle = await generate_insight(topic)
                angles.append(angle)
        except Exception as e:
            logger.error(
                "Failed to generate angle",
                topic=topic.title[:50],
                error=str(e),
            )

    logger.info("Generated angles", topic_count=len(topics), angle_count=len(angles))
    return angles
