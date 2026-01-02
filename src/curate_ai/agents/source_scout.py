"""Source Scout Agent - Uses ingestion module to collect candidate topics."""

from curate_ai.agents.schemas import TopicCandidate
from curate_ai.config import get_settings
from curate_ai.ingestion import IngestionManager, ingest_all_sources
from curate_ai.logging import get_logger

logger = get_logger(__name__)


async def collect_all_sources(
    days_back: int | None = None,
    config_path: str | None = None,
) -> list[TopicCandidate]:
    """
    Collect topics from all configured sources using the ingestion module.
    
    This is the main entry point for the Source Scout agent.
    
    Args:
        days_back: Number of days to look back (uses config default if None)
        config_path: Path to sources.yml (uses default if None)
    
    Returns:
        List of TopicCandidate objects from all sources
    """
    settings = get_settings()
    
    if days_back is None:
        days_back = settings.days_lookback
    
    logger.info("Source Scout starting collection", days_back=days_back)
    
    # Use the ingestion manager
    topics = await ingest_all_sources(days_back=days_back, config_path=config_path)
    
    logger.info(
        "Source Scout collection complete",
        total_topics=len(topics),
    )
    
    return topics


# For backward compatibility - alias the function
scout_topics = collect_all_sources
