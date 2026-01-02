"""Reddit scraper for the ingestion module."""

import asyncio
from datetime import datetime, timedelta, timezone

import httpx

from curate_ai.ingestion.base import BaseScraper, IngestionResult, SourceConfig
from curate_ai.logging import get_logger

logger = get_logger(__name__)


class RedditScraper(BaseScraper):
    """Scraper for Reddit subreddits using the public JSON API."""
    
    # Reddit's public JSON API (no auth required for public subreddits)
    BASE_URL = "https://www.reddit.com"
    
    def __init__(self, config: SourceConfig):
        super().__init__(config)
        self.subreddits = config.subreddits
    
    async def fetch(self, days_back: int = 3) -> list[IngestionResult]:
        """Fetch all configured subreddits concurrently."""
        if not self.subreddits:
            logger.info("No subreddits configured")
            return []
        
        tasks = [
            self._fetch_subreddit(sub, days_back)
            for sub in self.subreddits
        ]
        results = await asyncio.gather(*tasks)
        
        # Flatten and sort by score
        all_results = []
        for sub_results in results:
            all_results.extend(sub_results)
        
        # Sort by Reddit score (engagement)
        all_results.sort(key=lambda x: x.score or 0, reverse=True)
        
        logger.info("Reddit scraper completed", total_items=len(all_results), subreddits=len(self.subreddits))
        return all_results
    
    async def _fetch_subreddit(
        self,
        sub_config: dict,
        days_back: int
    ) -> list[IngestionResult]:
        """Fetch posts from a single subreddit."""
        subreddit = sub_config.get("subreddit", "")
        name = sub_config.get("name", f"r/{subreddit}")
        sort = sub_config.get("sort", "hot")
        limit = sub_config.get("limit", 25)
        
        if not subreddit:
            return []
        
        url = f"{self.BASE_URL}/r/{subreddit}/{sort}.json"
        
        try:
            async with httpx.AsyncClient(
                timeout=self.get_timeout(),
                follow_redirects=True
            ) as client:
                response = await client.get(
                    url,
                    params={"limit": limit, "raw_json": 1},
                    headers={
                        "User-Agent": self.get_user_agent(),
                    }
                )
                response.raise_for_status()
                data = response.json()
        except Exception as e:
            logger.warning("Failed to fetch subreddit", subreddit=subreddit, error=str(e))
            return []
        
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
        results = []
        
        posts = data.get("data", {}).get("children", [])
        for post in posts:
            post_data = post.get("data", {})
            
            # Parse creation date
            created_utc = post_data.get("created_utc", 0)
            if created_utc:
                published = datetime.fromtimestamp(created_utc, tz=timezone.utc)
                if published < cutoff_date:
                    continue
            else:
                published = None
            
            # Skip stickied posts (usually mod announcements)
            if post_data.get("stickied", False):
                continue
            
            # Get post URL (prefer external link over reddit post)
            post_url = post_data.get("url", "")
            is_self = post_data.get("is_self", False)
            permalink = f"https://reddit.com{post_data.get('permalink', '')}"
            
            # For self posts, use permalink; for links, use the external URL
            final_url = permalink if is_self else post_url
            
            # Build summary
            selftext = post_data.get("selftext", "")[:500]
            title = post_data.get("title", "Untitled")
            
            # Extract score and engagement
            score = post_data.get("score", 0)
            num_comments = post_data.get("num_comments", 0)
            
            results.append(IngestionResult(
                title=title,
                url=final_url,
                source=name,
                source_type="reddit",
                category="discussion",
                summary=selftext or f"Reddit post with {num_comments} comments",
                published_at=published,
                authors=[post_data.get("author", "")],
                tags=[post_data.get("link_flair_text", "")] if post_data.get("link_flair_text") else [],
                score=float(score),
                metadata={
                    "subreddit": subreddit,
                    "permalink": permalink,
                    "num_comments": num_comments,
                    "upvote_ratio": post_data.get("upvote_ratio", 0),
                    "is_self": is_self,
                },
            ))
        
        logger.debug("Fetched subreddit", subreddit=subreddit, count=len(results))
        return results
