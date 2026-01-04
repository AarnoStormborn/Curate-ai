"""Tests for the Web Search scraper."""

import pytest
from datetime import datetime, timezone

from curate_ai.ingestion.web_search import WebSearcher
from curate_ai.ingestion.base import SourceConfig, IngestionResult


class TestWebSearcher:
    """Tests for WebSearcher class."""

    @pytest.fixture
    def enabled_config(self) -> SourceConfig:
        """Create an enabled config for testing."""
        return SourceConfig(
            web_search={
                "enabled": True,
                "queries": ["AI news", "machine learning"],
                "max_results_per_query": 5,
            },
            settings={
                "request_timeout": 30,
                "user_agent": "CurateAI-Test/1.0",
            },
        )

    @pytest.fixture
    def disabled_config(self) -> SourceConfig:
        """Config with web search disabled."""
        return SourceConfig(
            web_search={"enabled": False},
            settings={},
        )

    @pytest.mark.asyncio
    async def test_fetch_returns_results(self, enabled_config: SourceConfig):
        """Test that fetch returns IngestionResult objects."""
        searcher = WebSearcher(enabled_config)
        results = await searcher.fetch()
        
        print(f"\n[Web Search Test] Fetched {len(results)} results")
        
        assert isinstance(results, list)
        
        if results:
            first = results[0]
            assert isinstance(first, IngestionResult)
            assert first.source == "Web Search"
            assert first.source_type == "web_search"
            assert first.title
            assert first.url.startswith("http")
            print(f"[Web Search Test] Sample: {first.title[:60]}...")
            print(f"[Web Search Test] URL: {first.url[:60]}...")

    @pytest.mark.asyncio
    async def test_fetch_disabled_returns_empty(self, disabled_config: SourceConfig):
        """Test that disabled config returns empty list."""
        searcher = WebSearcher(disabled_config)
        results = await searcher.fetch()
        
        assert results == []
        print("[Web Search Test] Disabled config correctly returns empty list")

    @pytest.mark.asyncio
    async def test_fetch_with_custom_queries(self):
        """Test fetching with custom search queries."""
        config = SourceConfig(
            web_search={
                "enabled": True,
                "queries": ["LLM developments 2025"],
                "max_results_per_query": 3,
            },
            settings={"request_timeout": 30},
        )
        
        searcher = WebSearcher(config)
        results = await searcher.fetch()
        
        print(f"\n[Web Search Test] Custom query results: {len(results)}")
        for r in results[:3]:
            print(f"  - {r.title[:50]}...")

    @pytest.mark.asyncio
    async def test_url_deduplication(self):
        """Test that duplicate URLs are removed."""
        config = SourceConfig(
            web_search={
                "enabled": True,
                "queries": ["AI news", "AI news today"],  # Similar queries
                "max_results_per_query": 5,
            },
            settings={"request_timeout": 30},
        )
        
        searcher = WebSearcher(config)
        results = await searcher.fetch()
        
        # Check for unique URLs
        urls = [r.url for r in results]
        unique_urls = set(urls)
        
        print(f"\n[Web Search Test] Deduplication:")
        print(f"  - Total results: {len(results)}")
        print(f"  - Unique URLs: {len(unique_urls)}")
        
        # All URLs should be unique (deduplication worked)
        assert len(urls) == len(unique_urls)

    @pytest.mark.asyncio
    async def test_duckduckgo_connectivity(self):
        """Test that DuckDuckGo HTML search is reachable."""
        import httpx
        
        url = "https://html.duckduckgo.com/html/"
        
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            response = await client.post(
                url,
                data={"q": "test query"},
                headers={"User-Agent": "CurateAI-Test/1.0"},
            )
            
            print(f"\n[Web Search Test] DuckDuckGo Connectivity:")
            print(f"  - Status: {response.status_code}")
            
            assert response.status_code == 200


# Quick standalone test
if __name__ == "__main__":
    import asyncio
    
    async def quick_test():
        print("=" * 60)
        print("Web Search Quick Test")
        print("=" * 60)
        
        config = SourceConfig(
            web_search={
                "enabled": True,
                "queries": [
                    "AI news today",
                    "machine learning breakthrough",
                    "LLM developments",
                ],
                "max_results_per_query": 5,
            },
            settings={"request_timeout": 30},
        )
        
        searcher = WebSearcher(config)
        results = await searcher.fetch()
        
        print(f"\nTotal results: {len(results)}")
        
        if results:
            print("\nSample results:")
            for i, r in enumerate(results[:7], 1):
                print(f"\n{i}. {r.title[:70]}...")
                print(f"   URL: {r.url[:60]}...")
                if r.summary:
                    print(f"   Summary: {r.summary[:80]}...")
        else:
            print("\n❌ No results returned! Check network or DuckDuckGo.")
            
    asyncio.run(quick_test())
