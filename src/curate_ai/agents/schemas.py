"""Pydantic schemas for structured agent I/O."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TopicCandidate(BaseModel):
    """A candidate topic discovered by the Source Scout agent."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = Field(..., description="Title of the paper/blog/release")
    source: str = Field(..., description="Source name (arXiv, OpenAI Blog, etc.)")
    source_type: Literal[
        "research",
        "blog",
        "release",
        "news",
        "discussion",
        "rss",
        "reddit",
        "web_search",
    ] = Field(
        ..., description="Type of source"
    )
    url: str = Field(..., description="URL to the original content")
    summary: str = Field(..., description="Brief summary of the content")
    published_at: datetime | None = Field(None, description="Publication date")
    authors: list[str] = Field(default_factory=list, description="Authors if available")
    tags: list[str] = Field(default_factory=list, description="Relevant tags/categories")


class ScoredTopic(TopicCandidate):
    """A topic with relevance scores from the Relevance Filter agent."""

    relevance_score: float = Field(
        ..., ge=0.0, le=1.0, description="Practical relevance score"
    )
    novelty_score: float = Field(
        ..., ge=0.0, le=1.0, description="Novelty/freshness score"
    )
    impact_score: float = Field(
        ..., ge=0.0, le=1.0, description="Long-term impact potential"
    )
    combined_score: float = Field(
        ..., ge=0.0, le=1.0, description="Weighted combined score"
    )
    rejection_reason: str | None = Field(
        None, description="Reason for rejection if filtered out"
    )
    is_rejected: bool = Field(default=False)


class InsightAngle(BaseModel):
    """An opinionated insight angle from the Insight Generator agent."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    topic_id: str = Field(..., description="ID of the source topic")
    stance: str = Field(
        ...,
        description="The opinionated take - must have a clear position",
    )
    why_it_matters: str = Field(
        ...,
        description="Why this insight is important - no neutral takes allowed",
    )
    second_order_effects: list[str] = Field(
        ...,
        min_length=1,
        description="Downstream implications and effects",
    )
    relevant_for: list[str] = Field(
        ...,
        min_length=1,
        description="Target audience segments (e.g., ML engineers, founders)",
    )
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Confidence in this angle"
    )
    supporting_evidence: list[str] = Field(
        default_factory=list, description="Key evidence points"
    )


class CuratedAsset(BaseModel):
    """A curated asset (diagram, figure, etc.) from the Asset Curator agent."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str = Field(..., description="Original URL of the asset")
    asset_type: Literal["diagram", "figure", "readme", "code", "link"] = Field(
        ..., description="Type of asset"
    )
    description: str = Field(..., description="What this asset shows/contains")
    local_path: str | None = Field(
        None, description="Local path if downloaded"
    )
    source_title: str | None = Field(
        None, description="Title of the source where asset was found"
    )


class FinalAngle(BaseModel):
    """A polished angle ready for the email brief."""

    insight: str = Field(
        ...,
        max_length=200,
        description="Core insight - must be ≤2 lines",
    )
    why_it_matters: str = Field(
        ..., description="Concise explanation of importance"
    )
    relevant_for: list[str] = Field(
        ..., description="Target audience segments"
    )
    framing_points: list[str] = Field(
        ...,
        min_length=2,
        max_length=5,
        description="Suggested framing as bullet points",
    )
    supporting_links: list[str] = Field(
        default_factory=list, description="Supporting URLs"
    )
    assets: list[CuratedAsset] = Field(
        default_factory=list, description="Supporting visual assets"
    )
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Confidence score"
    )
    original_topic_title: str = Field(
        ..., description="Title of the original topic"
    )


class EmailBrief(BaseModel):
    """The final email-ready research brief."""

    run_id: str = Field(..., description="Pipeline run ID")
    generated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Generation timestamp",
    )
    angles: list[FinalAngle] = Field(
        ...,
        min_length=1,
        max_length=5,
        description="Top 2-3 post-worthy angles",
    )
    topics_considered: int = Field(
        ..., description="Total topics considered in this run"
    )
    topics_filtered: int = Field(
        ..., description="Topics that passed filtering"
    )
    angles_generated: int = Field(
        ..., description="Total angles generated before selection"
    )


class PipelineContext(BaseModel):
    """Context passed between pipeline stages."""

    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    started_at: datetime = Field(default_factory=datetime.utcnow)
    config_hash: str | None = None
    dry_run: bool = False
    debug: bool = False

    # Pipeline state
    topics: list[TopicCandidate] = Field(default_factory=list)
    scored_topics: list[ScoredTopic] = Field(default_factory=list)
    filtered_topics: list[ScoredTopic] = Field(default_factory=list)
    angles: list[InsightAngle] = Field(default_factory=list)
    deduplicated_angles: list[InsightAngle] = Field(default_factory=list)
    assets: dict[str, list[CuratedAsset]] = Field(default_factory=dict)  # angle_id -> assets
    final_angles: list[FinalAngle] = Field(default_factory=list)
    email_brief: EmailBrief | None = None

    # Statistics
    rejection_reasons: dict[str, int] = Field(default_factory=dict)
