"""LLM utilities using LiteLLM for OpenAI API access."""

import os
from typing import Any

from litellm import acompletion
from pydantic import BaseModel

from curate_ai.config import get_settings
from curate_ai.logging import get_logger

logger = get_logger(__name__)


def setup_llm() -> None:
    """Configure LiteLLM with API keys."""
    settings = get_settings()
    if settings.openai_api_key:
        os.environ["OPENAI_API_KEY"] = settings.openai_api_key


async def llm_complete(
    prompt: str,
    system_prompt: str | None = None,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2000,
) -> str:
    """
    Make an LLM completion request using LiteLLM.
    
    Args:
        prompt: The user prompt
        system_prompt: Optional system prompt
        model: Model to use (defaults to config)
        temperature: Sampling temperature
        max_tokens: Maximum tokens to generate
    
    Returns:
        The generated text response
    """
    settings = get_settings()
    model = model or settings.llm_model

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    try:
        response = await acompletion(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        logger.error("LLM completion failed", error=str(e), model=model)
        raise


async def llm_structured(
    prompt: str,
    response_model: type[BaseModel],
    system_prompt: str | None = None,
    model: str | None = None,
) -> BaseModel:
    """
    Make an LLM request with structured output using JSON mode.
    
    Args:
        prompt: The user prompt
        response_model: Pydantic model for the response
        system_prompt: Optional system prompt
        model: Model to use (defaults to config)
    
    Returns:
        Parsed Pydantic model instance
    """
    settings = get_settings()
    model = model or settings.llm_model

    # Add schema to prompt for JSON output
    schema_json = response_model.model_json_schema()
    structured_prompt = f"""{prompt}

Respond with valid JSON matching this schema:
{schema_json}

Return only the JSON object, no markdown or explanation."""

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": structured_prompt})

    try:
        response = await acompletion(
            model=model,
            messages=messages,
            temperature=0.3,  # Lower temp for structured output
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or "{}"
        
        # Parse and validate with Pydantic
        import json
        data = json.loads(content)
        return response_model.model_validate(data)
    except Exception as e:
        logger.error("Structured LLM completion failed", error=str(e))
        raise
