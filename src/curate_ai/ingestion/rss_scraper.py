"""RSS/Atom feed scraper for the ingestion module."""

import asyncio
import re
from datetime import datetime, timedelta, timezone

import feedparser
import httpx

from curate_ai.ingestion.base import BaseScraper, IngestionResult, SourceConfig
from curate_ai.logging import get_logger

logger = get_logger(__name__)


class RSSscraper(BaseScraper):
    """Scraper for RSS and Atom feeds."""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.feeds = config.rss_feeds
    
    async def fetch(self, days_back: int = 3) -> list[IngestionResult]:
        """Fetch all configured RSS feeds concurrently."""
        if not self.feeds:
            logger.info("No RSS feeds configured")
            return []
        
        tasks = [
            self._fetch_feed(feed, days_back) 
            for feed in self.feeds
        ]
        results = await asyncio.gather(*tasks)
        
        # Flatten results
        all_results = []
        for feed_results in results:
            all_results.extend(feed_results)
        
        logger.info("RSS scraper completed", total_items=len(all_results), feeds=len(self.feeds))
        return all_results
    
    async def _fetch_feed(
        self, 
        feed_config: dict, 
        days_back: int
    ) -> list[IngestionResult]:
        """Fetch a single RSS feed."""
        name = feed_config.get("name", "Unknown")
        url = feed_config.get("url", "")
        category = feed_config.get("category", "news")
        
        if not url:
            return []
        
        try:
            async with httpx.AsyncClient(
                timeout=self.get_timeout(),
                follow_redirects=True
            ) as client:
                response = await client.get(
                    url,
                    headers={"User-Agent": self.get_user_agent()}
                )
                response.raise_for_status()
        except Exception as e:
            logger.warning("Failed to fetch RSS feed", source=name, error=str(e))
            return []
        
        # Parse feed
        feed = feedparser.parse(response.text)
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
        
        results = []
        for entry in feed.entries:
            # Parse publication date
            published = self._parse_date(entry)
            
            # Skip if too old
            if published and published < cutoff_date:
                continue
            
            # Extract and clean summary
            summary = self._extract_summary(entry)
            
            # Get URL
            entry_url = entry.get("link", "")
            if not entry_url:
                continue
            
            results.append(IngestionResult(
                title=entry.get("title", "Untitled").strip(),
                url=entry_url,
                source=name,
                source_type="rss",
                category=category,
                summary=summary,
                published_at=published,
                authors=self._extract_authors(entry),
                tags=self._extract_tags(entry),
                metadata={"feed_url": url},
            ))
        
        logger.debug("Fetched RSS feed", source=name, count=len(results))
        return results
    
    def _parse_date(self, entry) -> datetime | None:
        """Parse publication date from feed entry."""
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            try:
                return datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            except (TypeError, ValueError):
                pass
        
        if hasattr(entry, "updated_parsed") and entry.updated_parsed:
            try:
                return datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)
            except (TypeError, ValueError):
                pass
        
        return None
    
    def _extract_summary(self, entry) -> str:
        """Extract and clean summary from feed entry."""
        summary = ""
        if hasattr(entry, "summary"):
            summary = entry.summary
        elif hasattr(entry, "description"):
            summary = entry.description
        elif hasattr(entry, "content") and entry.content:
            summary = entry.content[0].get("value", "")
        
        # Clean HTML tags
        summary = re.sub(r'<[^>]+>', '', summary)
        # Clean extra whitespace
        summary = re.sub(r'\s+', ' ', summary).strip()
        
        return summary[:1000]  # Limit length
    
    def _extract_authors(self, entry) -> list[str]:
        """Extract authors from feed entry."""
        authors = []
        if hasattr(entry, "author"):
            authors.append(entry.author)
        if hasattr(entry, "authors"):
            for author in entry.authors:
                if isinstance(author, dict):
                    authors.append(author.get("name", ""))
                else:
                    authors.append(str(author))
        return [a for a in authors if a]
    
    def _extract_tags(self, entry) -> list[str]:
        """Extract tags/categories from feed entry."""
        tags = []
        if hasattr(entry, "tags"):
            for tag in entry.tags:
                if isinstance(tag, dict):
                    tags.append(tag.get("term", ""))
                else:
                    tags.append(str(tag))
        return [t for t in tags if t]
