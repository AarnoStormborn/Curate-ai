"""Asset Curator Agent - Collects source-linked supporting assets."""

from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from curate_ai.agents.schemas import CuratedAsset, InsightAngle
from curate_ai.config import get_settings
from curate_ai.logging import get_logger

logger = get_logger(__name__)


# Common image extensions
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}

# GitHub raw content base
GITHUB_RAW_BASE = "https://raw.githubusercontent.com"


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
async def extract_assets_from_url(url: str) -> list[dict]:
    """
    Extract potential assets (figures, diagrams) from a URL.
    
    This is a simplified implementation. In production, you might use
    BeautifulSoup or a headless browser for better extraction.
    
    Args:
        url: The URL to extract assets from
    
    Returns:
        List of asset dictionaries with url, type, description
    """
    assets = []

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            content = response.text

            # Simple extraction of image URLs from HTML/Markdown
            # Look for common patterns
            import re

            # Find markdown images: ![alt](url)
            md_images = re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', content)
            for alt, img_url in md_images:
                full_url = urljoin(url, img_url)
                if any(img_url.lower().endswith(ext) for ext in IMAGE_EXTENSIONS):
                    assets.append({
                        "url": full_url,
                        "asset_type": "figure",
                        "description": alt or "Figure from source",
                    })

            # Find HTML images: <img src="...">
            html_images = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', content)
            for img_url in html_images[:5]:  # Limit to first 5
                full_url = urljoin(url, img_url)
                if any(img_url.lower().endswith(ext) for ext in IMAGE_EXTENSIONS):
                    assets.append({
                        "url": full_url,
                        "asset_type": "figure",
                        "description": "Figure from source",
                    })

    except Exception as e:
        logger.warning("Failed to extract assets from URL", url=url, error=str(e))

    return assets[:3]  # Limit to 3 assets per source


async def fetch_github_readme(repo_url: str) -> CuratedAsset | None:
    """
    Fetch README from a GitHub repository.
    
    Args:
        repo_url: GitHub repository URL
    
    Returns:
        CuratedAsset if README found, None otherwise
    """
    try:
        parsed = urlparse(repo_url)
        if "github.com" not in parsed.netloc:
            return None

        # Extract owner/repo from path
        path_parts = parsed.path.strip("/").split("/")
        if len(path_parts) < 2:
            return None

        owner, repo = path_parts[0], path_parts[1]
        readme_url = f"{GITHUB_RAW_BASE}/{owner}/{repo}/main/README.md"

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(readme_url)
            if response.status_code == 404:
                # Try master branch
                readme_url = f"{GITHUB_RAW_BASE}/{owner}/{repo}/master/README.md"
                response = await client.get(readme_url)

            if response.status_code == 200:
                return CuratedAsset(
                    url=readme_url,
                    asset_type="readme",
                    description=f"README for {owner}/{repo}",
                    source_title=f"{owner}/{repo}",
                )
    except Exception as e:
        logger.warning("Failed to fetch GitHub README", url=repo_url, error=str(e))

    return None


@retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=5))
async def download_asset(
    url: str,
    asset_type: str,
    artifacts_dir: Path | None = None,
) -> str | None:
    """
    Download an asset to local storage.
    
    Args:
        url: URL of the asset to download
        asset_type: Type of asset (for organizing)
        artifacts_dir: Directory to save assets
    
    Returns:
        Local path if downloaded successfully, None otherwise
    """
    settings = get_settings()
    if artifacts_dir is None:
        artifacts_dir = settings.artifacts_path

    try:
        # Create type-specific subdirectory
        asset_dir = artifacts_dir / asset_type
        asset_dir.mkdir(parents=True, exist_ok=True)

        # Generate filename from URL
        parsed = urlparse(url)
        filename = Path(parsed.path).name
        if not filename:
            filename = f"asset_{hash(url) % 10000}"

        local_path = asset_dir / filename

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()

            # Write content
            local_path.write_bytes(response.content)

        logger.debug("Downloaded asset", url=url, local_path=str(local_path))
        return str(local_path)

    except Exception as e:
        logger.warning("Failed to download asset", url=url, error=str(e))
        return None


async def curate_assets_for_angles(
    angles: list[InsightAngle],
    source_urls: dict[str, str],  # topic_id -> url
    download: bool = False,
) -> dict[str, list[CuratedAsset]]:
    """
    Curate supporting assets for a list of insight angles.
    
    Args:
        angles: List of insight angles
        source_urls: Mapping of topic_id to source URL
        download: Whether to download assets locally
    
    Returns:
        Dictionary mapping angle_id to list of curated assets
    """
    result: dict[str, list[CuratedAsset]] = {}

    for angle in angles:
        assets: list[CuratedAsset] = []
        source_url = source_urls.get(angle.topic_id, "")

        if not source_url:
            result[angle.id] = []
            continue

        # Extract assets from the source URL
        extracted = await extract_assets_from_url(source_url)
        for asset_data in extracted:
            asset = CuratedAsset(
                url=asset_data["url"],
                asset_type=asset_data["asset_type"],
                description=asset_data["description"],
                source_title=f"From: {source_url}",
            )

            if download:
                local_path = await download_asset(
                    asset.url, asset.asset_type
                )
                asset.local_path = local_path

            assets.append(asset)

        # Try to get README if it's a GitHub link
        if "github.com" in source_url:
            readme = await fetch_github_readme(source_url)
            if readme:
                assets.append(readme)

        # Always include the source as a link asset
        assets.append(CuratedAsset(
            url=source_url,
            asset_type="link",
            description="Original source",
        ))

        result[angle.id] = assets
        logger.debug(
            "Curated assets for angle",
            angle_id=angle.id,
            asset_count=len(assets),
        )

    logger.info(
        "Curated assets",
        angle_count=len(angles),
        total_assets=sum(len(a) for a in result.values()),
    )

    return result
