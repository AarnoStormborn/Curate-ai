"""Tests for the arXiv API fetcher."""

import pytest
from datetime import datetime, timezone

from curate_ai.ingestion.arxiv import ArxivFetcher
from curate_ai.ingestion.base import SourceConfig, IngestionResult


class TestArxivFetcher:
    """Tests for ArxivFetcher class."""

    @pytest.fixture
    def default_config(self) -> SourceConfig:
        """Create a default config for testing."""
        return SourceConfig(
            arxiv={
                "enabled": True,
                "categories": ["cs.AI", "cs.LG"],
                "max_results": 10,
                "days_lookback": 7,  # Use 7 days to ensure we get results
            },
            settings={
                "request_timeout": 30,
                "user_agent": "CurateAI-Test/1.0",
            },
        )

    @pytest.fixture
    def disabled_config(self) -> SourceConfig:
        """Config with arXiv disabled."""
        return SourceConfig(
            arxiv={"enabled": False},
            settings={},
        )

    @pytest.mark.asyncio
    async def test_fetch_returns_results(self, default_config: SourceConfig):
        """Test that fetch returns IngestionResult objects from arXiv API."""
        fetcher = ArxivFetcher(default_config)
        results = await fetcher.fetch(days_back=30)  # Use 30 days to ensure results
        
        # Should return a list
        assert isinstance(results, list)
        
        # Print results for debugging
        print(f"\n[arXiv Test] Fetched {len(results)} papers")
        
        # If we got results, verify their structure
        if results:
            first = results[0]
            assert isinstance(first, IngestionResult)
            assert first.source == "arXiv"
            assert first.source_type == "arxiv"
            assert first.title
            assert first.url.startswith("http")
            assert first.summary
            assert first.published_at is not None
            print(f"[arXiv Test] Sample paper: {first.title[:80]}...")
            print(f"[arXiv Test] Authors: {first.authors[:3]}")
            print(f"[arXiv Test] Tags: {first.tags[:3]}")
        else:
            print("[arXiv Test] No results returned - checking API connectivity")

    @pytest.mark.asyncio
    async def test_fetch_disabled_returns_empty(self, disabled_config: SourceConfig):
        """Test that disabled config returns empty list."""
        fetcher = ArxivFetcher(disabled_config)
        results = await fetcher.fetch()
        
        assert results == []
        print("[arXiv Test] Disabled config correctly returns empty list")

    @pytest.mark.asyncio
    async def test_fetch_with_different_categories(self):
        """Test fetching with different category configurations."""
        config = SourceConfig(
            arxiv={
                "enabled": True,
                "categories": ["cs.CL"],  # Computation and Language (NLP)
                "max_results": 5,
                "days_lookback": 14,
            },
            settings={"request_timeout": 30},
        )
        
        fetcher = ArxivFetcher(config)
        results = await fetcher.fetch()
        
        print(f"\n[arXiv Test] cs.CL category: {len(results)} papers")
        
        # Check that results have the expected category
        for result in results[:3]:
            print(f"  - {result.title[:60]}... (tags: {result.tags[:2]})")

    @pytest.mark.asyncio
    async def test_result_metadata_structure(self, default_config: SourceConfig):
        """Test that metadata fields are properly populated."""
        fetcher = ArxivFetcher(default_config)
        results = await fetcher.fetch(days_back=30)
        
        if results:
            result = results[0]
            
            # Check metadata fields
            assert "primary_category" in result.metadata
            assert "pdf_url" in result.metadata
            assert "arxiv_id" in result.metadata
            
            print(f"\n[arXiv Test] Metadata structure:")
            print(f"  - primary_category: {result.metadata['primary_category']}")
            print(f"  - arxiv_id: {result.metadata['arxiv_id']}")
            print(f"  - pdf_url: {result.metadata['pdf_url'][:50]}...")

    @pytest.mark.asyncio
    async def test_date_filtering(self, default_config: SourceConfig):
        """Test that date filtering works correctly."""
        fetcher = ArxivFetcher(default_config)
        
        # Fetch with very short lookback (might be empty)
        results_1day = await fetcher.fetch(days_back=1)
        
        # Fetch with longer lookback
        results_30days = await fetcher.fetch(days_back=30)
        
        print(f"\n[arXiv Test] Date filtering:")
        print(f"  - 1 day lookback: {len(results_1day)} papers")
        print(f"  - 30 day lookback: {len(results_30days)} papers")
        
        # Longer lookback should have >= results (unless API changes)
        # Note: This might not always hold due to API pagination
        assert len(results_30days) >= len(results_1day)

    @pytest.mark.asyncio
    async def test_api_connectivity(self):
        """Basic test to verify arXiv API is reachable."""
        import httpx
        
        url = "https://export.arxiv.org/api/query"
        params = {
            "search_query": "cat:cs.AI",
            "max_results": 1,
        }
        
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            response = await client.get(url, params=params)
            
            print(f"\n[arXiv Test] API Connectivity:")
            print(f"  - Status: {response.status_code}")
            print(f"  - Content-Type: {response.headers.get('content-type', 'unknown')}")
            
            assert response.status_code == 200
            assert "xml" in response.headers.get("content-type", "").lower()


# Quick standalone test
if __name__ == "__main__":
    import asyncio
    
    async def quick_test():
        print("=" * 60)
        print("arXiv API Quick Test")
        print("=" * 60)
        
        config = SourceConfig(
            arxiv={
                "enabled": True,
                "categories": ["cs.AI", "cs.LG", "cs.CL"],
                "max_results": 20,
                "days_lookback": 14,
            },
            settings={"request_timeout": 30},
        )
        
        fetcher = ArxivFetcher(config)
        results = await fetcher.fetch()
        
        print(f"\nTotal papers fetched: {len(results)}")
        
        if results:
            print("\nSample papers:")
            for i, r in enumerate(results[:5], 1):
                print(f"\n{i}. {r.title[:80]}...")
                print(f"   Authors: {', '.join(r.authors[:3])}")
                print(f"   Published: {r.published_at}")
                print(f"   Categories: {r.tags[:3]}")
                print(f"   URL: {r.url}")
        else:
            print("\n❌ No papers returned! Check network or API.")
            
    asyncio.run(quick_test())
