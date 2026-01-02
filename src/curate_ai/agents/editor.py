"""Editor Agent - Compresses and formats output for email-ready briefs."""

from pydantic import BaseModel, Field

from curate_ai.agents.schemas import (
    CuratedAsset,
    EmailBrief,
    FinalAngle,
    InsightAngle,
)
from curate_ai.logging import get_logger

logger = get_logger(__name__)


class EditedAngle(BaseModel):
    """Structured output for an edited angle."""

    insight: str = Field(
        ...,
        max_length=200,
        description="Core insight compressed to ≤2 lines. Must be punchy and memorable."
    )
    why_it_matters: str = Field(
        ...,
        max_length=300,
        description="Concise explanation - cut the fluff."
    )
    framing_points: list[str] = Field(
        ...,
        min_length=2,
        max_length=5,
        description="Bullet points for suggested framing. Each ≤50 chars."
    )
    is_too_long: bool = Field(
        ...,
        description="Flag if the content couldn't be compressed enough."
    )


async def compress_angle(
    angle: InsightAngle,
    topic_title: str,
    assets: list[CuratedAsset],
) -> FinalAngle:
    """
    Compress and format an insight angle for the email brief.
    
    Args:
        angle: The raw insight angle
        topic_title: Title of the original topic
        assets: Curated assets for this angle
    
    Returns:
        A polished FinalAngle ready for email
    """
    # Compress the stance to ≤2 lines (~200 chars)
    insight = angle.stance
    if len(insight) > 200:
        # Truncate at sentence boundary if possible
        sentences = insight.split(". ")
        compressed = sentences[0]
        if len(compressed) <= 200:
            insight = compressed + "."
        else:
            insight = insight[:197] + "..."

    # Compress why_it_matters
    why = angle.why_it_matters
    if len(why) > 300:
        sentences = why.split(". ")
        why = ". ".join(sentences[:2]) + "."

    # Generate framing points from second-order effects
    framing = [
        effect[:50] if len(effect) <= 50 else effect[:47] + "..."
        for effect in angle.second_order_effects[:4]
    ]

    # Collect supporting links
    links = [asset.url for asset in assets if asset.asset_type == "link"]
    if angle.supporting_evidence:
        links.extend(angle.supporting_evidence[:2])

    # Filter to non-link assets
    visual_assets = [a for a in assets if a.asset_type != "link"]

    return FinalAngle(
        insight=insight,
        why_it_matters=why,
        relevant_for=angle.relevant_for,
        framing_points=framing,
        supporting_links=links[:5],
        assets=visual_assets[:3],
        confidence=angle.confidence,
        original_topic_title=topic_title,
    )


async def create_email_brief(
    run_id: str,
    angles: list[InsightAngle],
    assets_map: dict[str, list[CuratedAsset]],
    topic_titles: dict[str, str],
    stats: dict,
) -> EmailBrief:
    """
    Create the final email brief from processed angles.
    
    Args:
        run_id: Pipeline run ID
        angles: Deduplicated insight angles (should be top 2-3)
        assets_map: Mapping of angle_id to assets
        topic_titles: Mapping of topic_id to title
        stats: Pipeline statistics
    
    Returns:
        Complete EmailBrief ready for sending
    """
    final_angles: list[FinalAngle] = []

    # Sort by confidence and take top 3
    sorted_angles = sorted(angles, key=lambda a: a.confidence, reverse=True)[:3]

    for angle in sorted_angles:
        assets = assets_map.get(angle.id, [])
        title = topic_titles.get(angle.topic_id, "Unknown Topic")

        final_angle = await compress_angle(angle, title, assets)
        final_angles.append(final_angle)

    brief = EmailBrief(
        run_id=run_id,
        angles=final_angles,
        topics_considered=stats.get("topics_considered", 0),
        topics_filtered=stats.get("topics_filtered", 0),
        angles_generated=stats.get("angles_generated", 0),
    )

    logger.info(
        "Created email brief",
        run_id=run_id,
        angle_count=len(final_angles),
    )

    return brief


def validate_brief_quality(brief: EmailBrief) -> list[str]:
    """
    Validate the quality of an email brief.
    
    Returns list of issues (empty if brief passes quality check).
    """
    issues = []

    if len(brief.angles) < 1:
        issues.append("No angles in brief")

    if len(brief.angles) > 5:
        issues.append("Too many angles (max 5)")

    for i, angle in enumerate(brief.angles):
        if len(angle.insight) > 200:
            issues.append(f"Angle {i+1} insight too long ({len(angle.insight)} chars)")

        if len(angle.framing_points) < 2:
            issues.append(f"Angle {i+1} needs more framing points")

        if not angle.supporting_links:
            issues.append(f"Angle {i+1} has no supporting links")

    return issues
