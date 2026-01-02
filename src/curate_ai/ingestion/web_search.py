"""Web search scraper for the ingestion module."""

from datetime import datetime, timezone

from curate_ai.ingestion.base import BaseScraper, IngestionResult, SourceConfig
from curate_ai.logging import get_logger

logger = get_logger(__name__)


class WebSearcher(BaseScraper):
    """Web searcher for AI/ML news using DuckDuckGo."""
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.search_config = config.web_search
    
    async def fetch(self, days_back: int = 3) -> list[IngestionResult]:
        """Perform web searches for configured queries."""
        if not self.search_config.get("enabled", False):
            logger.info("Web search disabled")
            return []
        
        queries = self.search_config.get("queries", [])
        if not queries:
            logger.info("No search queries configured")
            return []
        
        max_results = self.search_config.get("max_results_per_query", 10)
        
        all_results = []
        seen_urls = set()
        
        for query in queries:
            try:
                results = await self._search(query, max_results, days_back)
                for result in results:
                    # Deduplicate by URL
                    if result.url not in seen_urls:
                        seen_urls.add(result.url)
                        all_results.append(result)
            except Exception as e:
                logger.warning("Search query failed", query=query, error=str(e))
        
        logger.info("Web search completed", total_items=len(all_results), queries=len(queries))
        return all_results
    
    async def _search(
        self,
        query: str,
        max_results: int,
        days_back: int
    ) -> list[IngestionResult]:
        """Perform a single search query using DuckDuckGo HTML."""
        import httpx
        import re
        from urllib.parse import unquote
        
        # Use DuckDuckGo HTML search
        url = "https://html.duckduckgo.com/html/"
        
        try:
            async with httpx.AsyncClient(
                timeout=self.get_timeout(),
                follow_redirects=True
            ) as client:
                response = await client.post(
                    url,
                    data={"q": query, "df": "d"},  # df=d for past day, or remove for any time
                    headers={
                        "User-Agent": self.get_user_agent(),
                        "Content-Type": "application/x-www-form-urlencoded",
                    }
                )
                response.raise_for_status()
                html = response.text
        except Exception as e:
            logger.warning("DuckDuckGo search failed", query=query, error=str(e))
            return []
        
        # Parse results from HTML
        results = []
        
        # Extract result blocks
        # DuckDuckGo HTML format: <a class="result__a" href="...">title</a>
        # and <a class="result__snippet">snippet</a>
        
        # Find all result links
        link_pattern = r'<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)</a>'
        snippet_pattern = r'<a[^>]*class="result__snippet"[^>]*>([^<]*)</a>'
        
        links = re.findall(link_pattern, html)
        snippets = re.findall(snippet_pattern, html)
        
        for i, (href, title) in enumerate(links[:max_results]):
            # DuckDuckGo uses redirect URLs, extract actual URL
            actual_url = href
            if "uddg=" in href:
                match = re.search(r'uddg=([^&]+)', href)
                if match:
                    actual_url = unquote(match.group(1))
            
            # Skip ad results
            if "ad_provider" in href or not actual_url.startswith("http"):
                continue
            
            snippet = snippets[i] if i < len(snippets) else ""
            
            results.append(IngestionResult(
                title=title.strip(),
                url=actual_url,
                source="Web Search",
                source_type="web_search",
                category="news",
                summary=snippet.strip(),
                published_at=datetime.now(timezone.utc),  # Approximate
                metadata={"query": query},
            ))
        
        logger.debug("Search completed", query=query, count=len(results))
        return results
