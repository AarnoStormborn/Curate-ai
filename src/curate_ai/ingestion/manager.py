"""Ingestion manager - orchestrates all data sources."""

import asyncio
from datetime import datetime, timezone

from curate_ai.agents.schemas import TopicCandidate
from curate_ai.ingestion.arxiv import ArxivFetcher
from curate_ai.ingestion.base import IngestionResult, SourceConfig
from curate_ai.ingestion.reddit import RedditScraper
from curate_ai.ingestion.rss_scraper import RSSscraper
from curate_ai.ingestion.web_search import WebSearcher
from curate_ai.logging import get_logger

logger = get_logger(__name__)


class IngestionManager:
    """Orchestrates all ingestion sources and deduplicates results."""
    
    def __init__(self, config_path: str | None = None):
        self.config = SourceConfig.load(config_path)
        
        # Initialize all scrapers
        self.rss_scraper = RSSscraper(self.config)
        self.reddit_scraper = RedditScraper(self.config)
        self.web_searcher = WebSearcher(self.config)
        self.arxiv_fetcher = ArxivFetcher(self.config)
    
    async def ingest_all(self, days_back: int | None = None) -> list[IngestionResult]:
        """
        Run all ingestion sources and return deduplicated results.
        
        Args:
            days_back: Number of days to look back (uses config default if None)
        
        Returns:
            List of deduplicated IngestionResult objects
        """
        if days_back is None:
            days_back = self.config.settings.get("default_days_lookback", 3)
        
        logger.info("Starting ingestion", days_back=days_back)
        
        # Run all scrapers concurrently
        tasks = [
            self.rss_scraper.fetch(days_back),
            self.reddit_scraper.fetch(days_back),
            self.web_searcher.fetch(days_back),
            self.arxiv_fetcher.fetch(days_back),
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Collect all results, handling exceptions
        all_results: list[IngestionResult] = []
        source_names = ["RSS", "Reddit", "Web Search", "arXiv"]
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"{source_names[i]} scraper failed", error=str(result))
            else:
                all_results.extend(result)
                logger.info(f"{source_names[i]} returned {len(result)} items")
        
        # Deduplicate by URL
        seen_urls: set[str] = set()
        unique_results: list[IngestionResult] = []
        
        for item in all_results:
            # Normalize URL (remove trailing slashes, fragments)
            url = item.url.rstrip("/").split("#")[0]
            
            if url not in seen_urls:
                seen_urls.add(url)
                unique_results.append(item)
        
        logger.info(
            "Ingestion complete",
            total_raw=len(all_results),
            unique=len(unique_results),
            duplicates_removed=len(all_results) - len(unique_results),
        )
        
        return unique_results
    
    async def ingest_to_topics(self, days_back: int | None = None) -> list[TopicCandidate]:
        """
        Ingest all sources and convert to TopicCandidate schema.
        
        This is the main entry point for the source_scout agent.
        """
        results = await self.ingest_all(days_back)
        
        topics: list[TopicCandidate] = []
        for item in results:
            topics.append(TopicCandidate(
                title=item.title,
                source=item.source,
                source_type=item.source_type,
                url=item.url,
                summary=item.summary,
                published_at=item.published_at,
                authors=item.authors,
                tags=item.tags,
            ))
        
        return topics


async def ingest_all_sources(
    days_back: int | None = None,
    config_path: str | None = None,
) -> list[TopicCandidate]:
    """
    Convenience function to ingest from all sources.
    
    Args:
        days_back: Number of days to look back
        config_path: Path to sources.yml config file
    
    Returns:
        List of TopicCandidate objects
    """
    manager = IngestionManager(config_path)
    return await manager.ingest_to_topics(days_back)
