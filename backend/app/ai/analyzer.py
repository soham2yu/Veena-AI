"""
LLM-powered incident transcript analyzer.

Supports multiple LLM providers via environment configuration.
Validates output against Pydantic schemas before returning.
"""

import json
import logging
import os
from abc import ABC, abstractmethod

from openai import AsyncOpenAI

from app.ai.prompts import INCIDENT_ANALYZER_SYSTEM_PROMPT, build_analysis_prompt
from app.ai.schemas import IncidentAnalysis

logger = logging.getLogger(__name__)
MAX_ANALYSIS_CONTEXT_CHARS = 80000


def _llm_api_keys() -> list[str]:
    """Return a list of API keys provided in environment variables."""
    raw_keys = os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not raw_keys:
        raise ValueError(
            "LLM_API_KEY (or GEMINI_API_KEY/GOOGLE_API_KEY) environment variable is required"
        )
    # Split by comma to support multiple keys
    return [k.strip() for k in raw_keys.split(",") if k.strip()]


class LLMProvider(ABC):
    """Abstract base for LLM providers."""

    @abstractmethod
    async def generate_json(self, system_prompt: str, user_prompt: str) -> dict:
        """Send a prompt to the LLM and return parsed JSON."""
        ...


class OpenAIProvider(LLMProvider):
    """OpenAI-compatible provider (also works with Azure, Groq, Together, etc.)."""

    def __init__(self):
        # OpenAI provider just takes the first key for now
        api_key = _llm_api_keys()[0]

        base_url = os.getenv("LLM_API_BASE")
        self.model = os.getenv("LLM_MODEL", "gpt-4o-mini")

        client_kwargs = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url

        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(**client_kwargs)

    async def generate_json(self, system_prompt: str, user_prompt: str) -> dict:
        import json
        logger.info("Calling OpenAI model=%s", self.model)

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )

        content = response.choices[0].message.content
        if not content:
            raise ValueError("LLM returned empty response")

        return json.loads(content)


class GeminiProvider(LLMProvider):
    """Google Gemini through native google-genai SDK for maximum stability."""

    def __init__(self):
        self.api_keys = _llm_api_keys()
        self.current_key_idx = 0

        self.model = os.getenv("LLM_MODEL", "gemini-3.6-flash")
        configured_fallbacks = os.getenv(
            "LLM_FALLBACK_MODELS",
            "gemini-2.5-flash,gemini-1.5-flash-latest,gemini-3.6-pro",
        )
        self.fallback_models = [
            model.strip()
            for model in configured_fallbacks.split(",")
            if model.strip() and model.strip() != self.model
        ]
        
    def _get_client(self):
        from google import genai
        return genai.Client(api_key=self.api_keys[self.current_key_idx])

    def _rotate_key(self):
        if len(self.api_keys) > 1:
            self.current_key_idx = (self.current_key_idx + 1) % len(self.api_keys)
            logger.warning("Rotated to API key index %d", self.current_key_idx)

    async def generate_json(self, system_prompt: str, user_prompt: str) -> dict:
        models_to_try = [self.model, *self.fallback_models]
        from google.genai import types
        
        import asyncio
        errors = []
        for model in models_to_try:
            logger.info("Calling Gemini natively model=%s with key index %d", model, self.current_key_idx)
            
            for attempt in range(2):
                try:
                    client = self._get_client()
                    response = await client.aio.models.generate_content(
                        model=model,
                        contents=user_prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_prompt,
                            temperature=0,
                            response_mime_type="application/json",
                        ),
                    )
                    if model != self.model:
                        logger.warning("Requested primary model failed; using fallback %s", model)
                    
                    content = response.text
                    if not content:
                        raise ValueError("LLM returned empty response")
                    return json.loads(content)
                    
                except Exception as error:
                    error_text = str(error).lower()
                    status_code = getattr(error, "code", getattr(error, "status_code", None))
                    
                    # Key rotation on quota exhaustion
                    if status_code == 429 or "quota" in error_text or "resource exhausted" in error_text:
                        if len(self.api_keys) > 1:
                            logger.warning(f"Key {self.current_key_idx} exhausted. Rotating...")
                            self._rotate_key()
                            # If we rotated, try the same model again with the new key immediately
                            if attempt < 1:
                                continue
                                
                    is_transient = status_code in (503, 502, 500) or "high demand" in error_text or "unavailable" in error_text
                    
                    if is_transient and attempt < 1:
                        wait_time = 2
                        logger.warning(f"Transient error {status_code} on {model}. Retrying in {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        continue
                        
                    errors.append(f"{model} failed (attempt {attempt+1}): {status_code} - {str(error)}")
                    
                    model_unavailable = status_code in (403, 404, 500, 502, 503, 429) or (
                        "not found" in error_text
                        or "does not exist" in error_text
                        or "unavailable" in error_text
                        or "high demand" in error_text
                        or "internal" in error_text
                        or "quota" in error_text
                    )
                    if not model_unavailable:
                        raise ValueError(f"Fatal error on {model}: {str(error)}")
                    logger.warning("Gemini model %s is unavailable; trying next", model)
                    break # Break retry loop, go to next model
                
        if any("429" in e or "quota" in e.lower() or "resource exhausted" in e.lower() for e in errors):
            logger.warning("Quota exhausted! Notifying user directly.")
            return {
                "topics": [], "decisions": [], "timeline": [], "risks": [], "code_findings": [],
                "ai_response": "My API rate limit is exhausted because too many requests were sent at once. Please wait exactly one minute for the quota to reset.",
                "room_vibe": "Stressed",
                "vaani_action": {
                    "action": "ANSWER", 
                    "speak": True, 
                    "text": "My API rate limit is exhausted because too many requests were sent at once. Please wait exactly one minute for the quota to reset.", 
                    "topic": "System Health"
                }
            }
            
        raise ValueError(f"All models failed! Errors: {' | '.join(errors)}")


def _create_provider() -> LLMProvider:
    """Factory: create the appropriate LLM provider from environment config."""
    provider_name = os.getenv("LLM_PROVIDER", "gemini").lower()

    providers = {
        "openai": OpenAIProvider,
        "gemini": GeminiProvider,
    }

    provider_class = providers.get(provider_name)
    if not provider_class:
        raise ValueError(
            f"Unsupported LLM_PROVIDER: '{provider_name}'. "
            f"Supported: {', '.join(providers.keys())}"
        )

    return provider_class()


class IncidentAnalyzer:
    """
    Analyzes incident transcripts using an LLM and returns
    structured incident intelligence.
    """

    def __init__(self):
        self._provider: LLMProvider | None = None

    @property
    def provider(self) -> LLMProvider:
        """Lazy-initialize the provider so env vars are read at call time."""
        if self._provider is None:
            self._provider = _create_provider()
        return self._provider

    async def analyze(self, transcript: list[dict], project_context: str | None = None) -> IncidentAnalysis:
        """
        Analyze a transcript and return structured incident intelligence.
        """
        if project_context and len(project_context) > MAX_ANALYSIS_CONTEXT_CHARS:
            logger.warning(
                "Truncating stored project context from %d to %d characters",
                len(project_context),
                MAX_ANALYSIS_CONTEXT_CHARS,
            )
            project_context = project_context[:MAX_ANALYSIS_CONTEXT_CHARS]
        user_prompt = build_analysis_prompt(transcript, project_context=project_context)

        # Call LLM with retry on validation failure
        max_retries = 0
        last_error = None

        for attempt in range(max_retries + 1):
            try:
                raw_output = await self.provider.generate_json(
                    system_prompt=INCIDENT_ANALYZER_SYSTEM_PROMPT,
                    user_prompt=user_prompt,
                )

                # Validate against Pydantic schema
                analysis = IncidentAnalysis.model_validate(raw_output)

                logger.info(
                    "Analysis complete: %d topics, %d decisions, %d timeline events, %d risks",
                    len(analysis.topics),
                    len(analysis.decisions),
                    len(analysis.timeline),
                    len(analysis.risks),
                )

                return analysis

            except (json.JSONDecodeError, ValueError) as e:
                last_error = e
                logger.warning(
                    "LLM output validation failed (attempt %d/%d): %s",
                    attempt + 1,
                    max_retries + 1,
                    str(e),
                )
                continue

        raise ValueError(
            f"Failed to get valid analysis after {max_retries + 1} attempts. "
            f"Last error: {last_error}"
        )


# Module-level singleton for convenience
analyzer = IncidentAnalyzer()
