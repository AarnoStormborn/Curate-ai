"""Slack notification service for sending research briefs via webhook."""

import httpx
from jinja2 import Template

from curate_ai.agents.schemas import EmailBrief
from curate_ai.config import get_settings
from curate_ai.logging import get_logger

logger = get_logger(__name__)


# Slack Block Kit template for the brief
SLACK_TEMPLATE = """
{
    "blocks": [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🔬 AI Research Brief",
                "emoji": true
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "plain_text",
                    "text": "{{ brief.generated_at.strftime('%B %d, %Y at %H:%M UTC') }} • {{ brief.angles | length }} insights"
                }
            ]
        },
        {
            "type": "divider"
        }
        {%- for angle in brief.angles %},
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "*Insight {{ loop.index }}*\n\n*{{ angle.insight | replace('\"', '\\"') }}*\n\n{{ angle.why_it_matters | replace('\"', '\\"') }}"
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": "📍 *Relevant for:* {{ angle.relevant_for | join(', ') }}"
                }
            ]
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "*💡 Framing Ideas:*\n{% for point in angle.framing_points %}• {{ point | replace('\"', '\\"') }}\n{% endfor %}"
            }
        }
        {%- if angle.supporting_links %},
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": "🔗 {% for link in angle.supporting_links %}<{{ link }}|Source>{% if not loop.last %} • {% endif %}{% endfor %}"
                }
            ]
        }
        {%- endif %},
        {
            "type": "context",
            "elements": [
                {
                    "type": "plain_text",
                    "text": "Confidence: {{ (angle.confidence * 100) | int }}%"
                }
            ]
        }
        {%- if not loop.last %},
        {
            "type": "divider"
        }
        {%- endif %}
        {%- endfor %},
        {
            "type": "divider"
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": "📊 *Stats:* {{ brief.topics_considered }} topics → {{ brief.topics_filtered }} filtered → {{ brief.angles | length }} selected | Run: `{{ brief.run_id[:8] }}`"
                }
            ]
        }
    ]
}
"""

# Simple text fallback for Slack
SIMPLE_TEXT_TEMPLATE = """🔬 *AI Research Brief* - {{ brief.generated_at.strftime('%B %d, %Y') }}

{% for angle in brief.angles %}
---
*Insight {{ loop.index }}:* {{ angle.insight }}

{{ angle.why_it_matters }}

📍 Relevant for: {{ angle.relevant_for | join(', ') }}

💡 Framing:
{% for point in angle.framing_points %}• {{ point }}
{% endfor %}
{% if angle.supporting_links %}🔗 {{ angle.supporting_links[0] }}
{% endif %}
{% endfor %}
---
📊 {{ brief.topics_considered }} topics → {{ brief.topics_filtered }} filtered → {{ brief.angles | length }} selected
"""


class SlackService:
    """Service for sending briefs to Slack via webhook."""

    def __init__(self):
        self.settings = get_settings()
        self.template = Template(SLACK_TEMPLATE)
        self.simple_template = Template(SIMPLE_TEXT_TEMPLATE)

    def render_blocks(self, brief: EmailBrief) -> dict:
        """Render the brief as Slack Block Kit JSON."""
        import json
        rendered = self.template.render(brief=brief)
        return json.loads(rendered)

    def render_simple(self, brief: EmailBrief) -> str:
        """Render as simple markdown text."""
        return self.simple_template.render(brief=brief)

    async def send(self, brief: EmailBrief) -> tuple[bool, str | None]:
        """
        Send the brief to Slack webhook.
        
        Args:
            brief: The email brief to send
        
        Returns:
            Tuple of (success, error_message)
        """
        webhook_url = self.settings.slack_webhook_url

        if not webhook_url:
            return False, "Slack webhook URL not configured"

        try:
            # Try Block Kit first
            try:
                payload = self.render_blocks(brief)
            except Exception as e:
                # Fall back to simple text
                logger.warning("Block Kit render failed, using simple text", error=str(e))
                payload = {"text": self.render_simple(brief)}

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    webhook_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )

                if response.status_code == 200 and response.text == "ok":
                    logger.info(
                        "Slack notification sent",
                        run_id=brief.run_id,
                        angles=len(brief.angles),
                    )
                    return True, None
                else:
                    error_msg = f"Slack API error: {response.status_code} - {response.text}"
                    logger.error("Slack send failed", error=error_msg)
                    return False, error_msg

        except Exception as e:
            error_msg = str(e)
            logger.error("Failed to send Slack notification", error=error_msg)
            return False, error_msg


async def send_to_slack(brief: EmailBrief) -> bool:
    """
    Convenience function to send a brief to Slack.
    
    Args:
        brief: The EmailBrief to send
    
    Returns:
        True if sent successfully
    """
    service = SlackService()
    success, error = await service.send(brief)

    if not success:
        logger.error("Slack notification failed", error=error)

    return success
