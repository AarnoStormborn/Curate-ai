"""Base classes and schemas for the ingestion module."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from curate_ai.logging import get_logger

logger = get_logger(__name__)


@dataclass
class IngestionResult:
    """Result from an ingestion source."""
    
    title: str
    url: str
    source: str
    source_type: str  # rss, reddit, web_search, arxiv
    category: str = ""
    summary: str = ""
    published_at: datetime | None = None
    authors: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    score: float | None = None  # Reddit score, relevance, etc.
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SourceConfig:
    """Configuration for data sources loaded from YAML."""
    
    rss_feeds: list[dict[str, Any]] = field(default_factory=list)
    subreddits: list[dict[str, Any]] = field(default_factory=list)
    web_search: dict[str, Any] = field(default_factory=dict)
    arxiv: dict[str, Any] = field(default_factory=dict)
    settings: dict[str, Any] = field(default_factory=dict)
    
    @classmethod
    def load(cls, config_path: str | Path | None = None) -> "SourceConfig":
        """Load configuration from YAML file."""
        if config_path is None:
            # Default to config/sources.yml relative to project root
            config_path = Path(__file__).parent.parent.parent.parent / "config" / "sources.yml"
        
        config_path = Path(config_path)
        
        if not config_path.exists():
            logger.warning("Config file not found, using defaults", path=str(config_path))
            return cls()
        
        with open(config_path) as f:
            data = yaml.safe_load(f) or {}
        
        return cls(
            rss_feeds=data.get("rss_feeds", []),
            subreddits=data.get("subreddits", []),
            web_search=data.get("web_search", {}),
            arxiv=data.get("arxiv", {}),
            settings=data.get("settings", {}),
        )


class BaseScraper(ABC):
    """Base class for all scrapers."""
    
    def __init__(self, config: SourceConfig):
        self.config = config
        self.settings = config.settings
    
    @abstractmethod
    async def fetch(self, days_back: int = 3) -> list[IngestionResult]:
        """Fetch results from this source."""
        pass
    
    def get_timeout(self) -> int:
        """Get request timeout from config."""
        return self.settings.get("request_timeout", 30)
    
    def get_user_agent(self) -> str:
        """Get user agent from config."""
        return self.settings.get("user_agent", "Mozilla/5.0 (compatible; CurateAI/1.0)")
