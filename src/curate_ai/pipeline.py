"""Pipeline orchestration for the Curate AI agent workflow."""

import hashlib
import time
import uuid
from datetime import datetime

from curate_ai.agents.asset_curator import curate_assets_for_angles
from curate_ai.agents.editor import create_email_brief, validate_brief_quality
from curate_ai.agents.insight_generator import generate_angles_batch
from curate_ai.agents.redundancy_checker import compute_embedding, deduplicate_angles
from curate_ai.agents.relevance_filter import filter_topics
from curate_ai.agents.schemas import EmailBrief, PipelineContext
from curate_ai.agents.source_scout import collect_all_sources
from curate_ai.config import get_settings
from curate_ai.db.repositories import (
    AgentRunRepository,
    AngleRepository,
    EmailRepository,
    RejectedItemRepository,
    TopicRepository,
)
from curate_ai.db.session import get_session
from curate_ai.logging import get_logger

logger = get_logger(__name__)


def compute_config_hash() -> str:
    """Compute a hash of the current configuration for reproducibility."""
    settings = get_settings()
    config_str = f"{settings.llm_model}|{settings.arxiv_categories}|{settings.days_lookback}"
    return hashlib.sha256(config_str.encode()).hexdigest()[:16]


async def load_prior_embeddings() -> list[list[float]]:
    """Load embeddings from prior angles for redundancy checking."""
    # In a full implementation, this would query the database
    # For now, returning empty list (no prior embeddings)
    return []


async def run_pipeline(
    dry_run: bool = False,
    debug: bool = False,
) -> EmailBrief | None:
    """
    Execute the full Curate AI pipeline.
    
    Pipeline stages:
    1. Source Scout: Collect candidate topics
    2. Relevance Filter: Score and filter topics
    3. Insight Generator: Generate opinionated angles
    4. Redundancy Checker: Remove duplicate themes
    5. Asset Curator: Collect supporting materials
    6. Editor: Compress and format for email
    
    Args:
        dry_run: If True, skip sending email
        debug: If True, enable verbose logging
    
    Returns:
        EmailBrief if successful, None if no quality content found
    """
    start_time = time.time()
    run_id = str(uuid.uuid4())
    config_hash = compute_config_hash()

    logger.info("Starting pipeline", run_id=run_id, dry_run=dry_run, debug=debug)

    # Initialize context
    ctx = PipelineContext(
        run_id=run_id,
        config_hash=config_hash,
        dry_run=dry_run,
        debug=debug,
    )

    try:
        async with get_session() as session:
            # Create run record
            run_repo = AgentRunRepository(session)
            topic_repo = TopicRepository(session)
            angle_repo = AngleRepository(session)
            rejected_repo = RejectedItemRepository(session)
            email_repo = EmailRepository(session)

            run = await run_repo.create(
                config_hash=config_hash,
                metadata={"dry_run": dry_run, "debug": debug},
            )
            run_uuid = run.id

            # ===== Stage 1: Source Scout =====
            logger.info("Stage 1: Collecting sources")
            ctx.topics = await collect_all_sources()
            logger.info("Collected topics", count=len(ctx.topics))

            if not ctx.topics:
                logger.warning("No topics found, ending pipeline")
                await run_repo.complete(
                    run_uuid,
                    duration_seconds=time.time() - start_time,
                    error_message="No topics found",
                )
                return None

            # Persist topics to database
            for topic in ctx.topics:
                await topic_repo.create(
                    run_id=run_uuid,
                    title=topic.title,
                    source=topic.source,
                    source_type=topic.source_type,
                    url=topic.url,
                    summary=topic.summary,
                    published_at=topic.published_at,
                )

            # ===== Stage 2: Relevance Filter =====
            logger.info("Stage 2: Filtering topics")
            ctx.scored_topics = await filter_topics(ctx.topics)
            ctx.filtered_topics = [t for t in ctx.scored_topics if not t.is_rejected]
            logger.info(
                "Filtered topics",
                input=len(ctx.topics),
                passed=len(ctx.filtered_topics),
            )

            # Track rejections
            for topic in ctx.scored_topics:
                if topic.is_rejected and topic.rejection_reason:
                    ctx.rejection_reasons[topic.rejection_reason] = (
                        ctx.rejection_reasons.get(topic.rejection_reason, 0) + 1
                    )

            if not ctx.filtered_topics:
                logger.warning("No topics passed filtering")
                await run_repo.complete(
                    run_uuid,
                    duration_seconds=time.time() - start_time,
                    error_message="No topics passed relevance filter",
                )
                return None

            # ===== Stage 3: Insight Generator =====
            logger.info("Stage 3: Generating insights")
            ctx.angles = await generate_angles_batch(ctx.filtered_topics)
            logger.info("Generated angles", count=len(ctx.angles))

            # Persist angles
            for angle in ctx.angles:
                embedding = await compute_embedding(
                    f"{angle.stance} {angle.why_it_matters}"
                )
                await angle_repo.create(
                    run_id=run_uuid,
                    topic_id=uuid.UUID(angle.topic_id),
                    stance=angle.stance,
                    why_it_matters=angle.why_it_matters,
                    second_order_effects=angle.second_order_effects,
                    relevant_for=angle.relevant_for,
                    confidence=angle.confidence,
                    embedding=embedding,
                )

            # ===== Stage 4: Redundancy Checker =====
            logger.info("Stage 4: Checking redundancy")
            prior_embeddings = await load_prior_embeddings()
            ctx.deduplicated_angles, rejected = await deduplicate_angles(
                ctx.angles, prior_embeddings
            )
            logger.info(
                "Deduplicated angles",
                kept=len(ctx.deduplicated_angles),
                rejected=len(rejected),
            )

            # Track rejections
            for angle, reason in rejected:
                await rejected_repo.create(
                    run_id=run_uuid,
                    item_type="angle",
                    item_id=uuid.UUID(angle.id),
                    rejection_reason=reason,
                    rejection_stage="redundancy",
                )

            if not ctx.deduplicated_angles:
                logger.warning("All angles were redundant")
                await run_repo.complete(
                    run_uuid,
                    duration_seconds=time.time() - start_time,
                    error_message="All angles filtered as redundant",
                )
                return None

            # ===== Stage 5: Asset Curator =====
            logger.info("Stage 5: Curating assets")
            source_urls = {
                t.id: t.url for t in ctx.filtered_topics
            }
            ctx.assets = await curate_assets_for_angles(
                ctx.deduplicated_angles,
                source_urls,
                download=not dry_run,
            )
            logger.info(
                "Curated assets",
                total=sum(len(a) for a in ctx.assets.values()),
            )

            # ===== Stage 6: Editor =====
            logger.info("Stage 6: Creating email brief")
            topic_titles = {t.id: t.title for t in ctx.filtered_topics}
            stats = {
                "topics_considered": len(ctx.topics),
                "topics_filtered": len(ctx.filtered_topics),
                "angles_generated": len(ctx.angles),
            }

            ctx.email_brief = await create_email_brief(
                run_id=run_id,
                angles=ctx.deduplicated_angles,
                assets_map=ctx.assets,
                topic_titles=topic_titles,
                stats=stats,
            )

            # Validate brief quality
            issues = validate_brief_quality(ctx.email_brief)
            if issues:
                logger.warning("Brief quality issues", issues=issues)

            # Mark selected angles
            selected_ids = [
                uuid.UUID(a.topic_id)  # Note: using topic_id as we don't have angle_id in final
                for a in ctx.email_brief.angles
            ]
            if selected_ids:
                await angle_repo.mark_selected(selected_ids)

            # Complete the run
            duration = time.time() - start_time
            await run_repo.complete(run_uuid, duration_seconds=duration)

            logger.info(
                "Pipeline completed",
                run_id=run_id,
                duration=f"{duration:.2f}s",
                angles=len(ctx.email_brief.angles),
            )

            return ctx.email_brief

    except Exception as e:
        logger.error("Pipeline failed", run_id=run_id, error=str(e))
        raise


async def run_pipeline_safe(
    dry_run: bool = False,
    debug: bool = False,
) -> tuple[EmailBrief | None, str | None]:
    """
    Execute pipeline with error handling.
    
    Returns:
        Tuple of (EmailBrief or None, error message or None)
    """
    try:
        brief = await run_pipeline(dry_run=dry_run, debug=debug)
        return brief, None
    except Exception as e:
        return None, str(e)
