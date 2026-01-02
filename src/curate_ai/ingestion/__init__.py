"""Ingestion module for Curate AI - handles all data source collection."""

from curate_ai.ingestion.base import IngestionResult, SourceConfig
from curate_ai.ingestion.manager import IngestionManager, ingest_all_sources
from curate_ai.ingestion.rss_scraper import RSSscraper
from curate_ai.ingestion.reddit import RedditScraper
from curate_ai.ingestion.web_search import WebSearcher
from curate_ai.ingestion.arxiv import ArxivFetcher

__all__ = [
    "IngestionResult",
    "SourceConfig",
    "IngestionManager",
    "ingest_all_sources",
    "RSSscraper",
    "RedditScraper",
    "WebSearcher",
    "ArxivFetcher",
]
