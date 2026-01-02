"""CLI entrypoint for running the Curate AI pipeline."""

import argparse
import asyncio
import sys
from datetime import datetime, timezone

from curate_ai.config import get_settings
from curate_ai.db.session import close_db, init_db
from curate_ai.llm import setup_llm
from curate_ai.logging import setup_logging, get_logger
from curate_ai.pipeline import run_pipeline
from curate_ai.services.slack_service import send_to_slack

logger = get_logger(__name__)


async def run(
    dry_run: bool = False,
    debug: bool = False,
    skip_notify: bool = False,
    test_notify: bool = False,
) -> int:
    """
    Execute the Curate AI pipeline.
    
    Args:
        dry_run: Run pipeline without sending Slack notification
        debug: Enable debug logging
        skip_notify: Skip notification even if brief is generated
        test_notify: Send a test notification without running pipeline
    
    Returns:
        Exit code (0 for success)
    """
    setup_logging()
    setup_llm()
    settings = get_settings()

    logger.info(
        "Curate AI starting",
        model=settings.llm_model,
        dry_run=dry_run,
        debug=debug,
    )

    try:
        # Initialize database (dev only - production uses migrations)
        await init_db()

        if test_notify:
            # Send a test notification with dummy content
            from curate_ai.agents.schemas import EmailBrief, FinalAngle

            test_brief = EmailBrief(
                run_id="test-run-001",
                generated_at=datetime.now(timezone.utc),
                angles=[
                    FinalAngle(
                        insight="This is a test insight to verify Slack delivery.",
                        why_it_matters="Testing the full notification pipeline.",
                        relevant_for=["Developers", "Testers"],
                        framing_points=["Test point 1", "Test point 2"],
                        supporting_links=["https://example.com"],
                        assets=[],
                        confidence=0.95,
                        original_topic_title="Test Topic",
                    )
                ],
                topics_considered=10,
                topics_filtered=5,
                angles_generated=3,
            )

            success = await send_to_slack(test_brief)
            if success:
                logger.info("Test notification sent successfully")
                return 0
            else:
                logger.error("Test notification failed")
                return 1

        # Run the full pipeline
        brief = await run_pipeline(dry_run=dry_run, debug=debug)

        if brief is None:
            logger.warning("Pipeline completed but no brief generated")
            return 0  # Not an error, just no content

        logger.info(
            "Brief generated",
            angles=len(brief.angles),
            run_id=brief.run_id,
        )

        # Send notification unless skipped
        if not dry_run and not skip_notify:
            success = await send_to_slack(brief)
            if not success:
                logger.error("Failed to send Slack notification")
                return 1

        return 0

    except Exception as e:
        logger.error("Pipeline failed", error=str(e))
        if debug:
            raise
        return 1

    finally:
        await close_db()


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Curate AI - Personal AI/ML research curation system",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  curate-ai                    # Run full pipeline and send to Slack
  curate-ai --dry-run          # Run pipeline without notification
  curate-ai --debug            # Run with verbose logging
  curate-ai --test-notify      # Send a test notification only
  python -m curate_ai.run      # Alternative invocation
        """,
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run pipeline without sending notification",
    )

    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )

    parser.add_argument(
        "--skip-notify",
        action="store_true",
        help="Generate brief but don't send notification",
    )

    parser.add_argument(
        "--test-notify",
        action="store_true",
        help="Send a test notification without running pipeline",
    )

    args = parser.parse_args()

    # Run async main
    exit_code = asyncio.run(
        run(
            dry_run=args.dry_run,
            debug=args.debug,
            skip_notify=args.skip_notify,
            test_notify=args.test_notify,
        )
    )

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
