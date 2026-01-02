"""Configuration management for Curate AI using Pydantic Settings."""

from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://curate:curate@localhost:5432/curate_ai",
        description="PostgreSQL connection URL with asyncpg driver",
    )

    # LLM Configuration (OpenAI via LiteLLM)
    openai_api_key: str = Field(
        default="",
        description="OpenAI API key",
    )
    llm_model: str = Field(
        default="gpt-5-mini",
        description="LLM model to use (via LiteLLM)",
    )

    # Slack Webhook
    slack_webhook_url: str = Field(
        default="",
        description="Slack webhook URL for notifications",
    )

    # Vector Store
    vector_dimension: int = Field(default=768)
    similarity_threshold: float = Field(default=0.85)

    # Sources Configuration
    arxiv_categories: str = Field(default="cs.AI,cs.LG,cs.CL")
    days_lookback: int = Field(default=3)

    # Storage
    artifacts_dir: Path = Field(default=Path("./artifacts"))

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO")
    log_format: Literal["json", "console"] = Field(default="json")

    @property
    def arxiv_categories_list(self) -> list[str]:
        """Get arxiv categories as a list."""
        return [cat.strip() for cat in self.arxiv_categories.split(",")]

    @property
    def artifacts_path(self) -> Path:
        """Ensure artifacts directory exists and return path."""
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        return self.artifacts_dir


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get the global settings instance."""
    return settings
