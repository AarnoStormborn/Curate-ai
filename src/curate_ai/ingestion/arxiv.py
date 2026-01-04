"""arXiv API scraper for the ingestion module."""

from datetime import datetime, timedelta, timezone

import feedparser
import httpx

from curate_ai.ingestion.base import BaseScraper, IngestionResult, SourceConfig
from curate_ai.logging import get_logger

logger = get_logger(__name__)


class ArxivFetcher(BaseScraper):
    """Fetcher for arXiv research papers."""
    
    API_URL = "https://export.arxiv.org/api/query"
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.arxiv_config = config.arxiv
    
    async def fetch(self, days_back: int | None = None) -> list[IngestionResult]:
        """Fetch papers from arXiv API."""
        if not self.arxiv_config.get("enabled", True):
            logger.info("arXiv disabled")
            return []
        
        categories = self.arxiv_config.get("categories", ["cs.AI", "cs.LG", "cs.CL"])
        max_results = self.arxiv_config.get("max_results", 50)
        
        if days_back is None:
            days_back = self.arxiv_config.get("days_lookback", 3)
        
        # Build query
        cat_query = " OR ".join(f"cat:{cat}" for cat in categories)
        
        params = {
            "search_query": cat_query,
            "sortBy": "submittedDate",
            "sortOrder": "descending",
            "start": 0,
            "max_results": max_results,
        }
        
        try:
            async with httpx.AsyncClient(
                timeout=self.get_timeout(),
                follow_redirects=True,
            ) as client:
                response = await client.get(self.API_URL, params=params)
                response.raise_for_status()
        except Exception as e:
            logger.error("arXiv API failed", error=str(e))
            return []
        
        # Parse Atom feed
        feed = feedparser.parse(response.text)
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
        
        results = []
        for entry in feed.entries:
            # Parse publication date
            try:
                published = datetime.fromisoformat(
                    entry.published.replace("Z", "+00:00")
                )
                if published < cutoff_date:
                    continue
            except (AttributeError, ValueError):
                continue
            
            # Extract primary category
            primary_cat = entry.get("arxiv_primary_category", {}).get("term", "")
            
            # Extract all categories
            categories = [tag.term for tag in entry.get("tags", [])]
            
            # Extract authors
            authors = [author.name for author in entry.get("authors", [])]
            
            # Clean title and summary
            title = entry.title.replace("\n", " ").strip()
            summary = entry.summary.replace("\n", " ").strip()
            
            # Get PDF link
            pdf_link = entry.link
            for link in entry.get("links", []):
                if link.get("type") == "application/pdf":
                    pdf_link = link.get("href", entry.link)
                    break
            
            results.append(IngestionResult(
                title=title,
                url=entry.link,
                source="arXiv",
                source_type="arxiv",
                category="research",
                summary=summary[:1500],
                published_at=published,
                authors=authors,
                tags=categories,
                metadata={
                    "primary_category": primary_cat,
                    "pdf_url": pdf_link,
                    "arxiv_id": entry.id.split("/abs/")[-1] if "/abs/" in entry.id else entry.id,
                },
            ))
        
        logger.info("arXiv fetch completed", count=len(results), categories=len(categories))
        return results
