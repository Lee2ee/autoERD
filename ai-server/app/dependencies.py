import os
import logging
from app.providers.base_provider import BaseProvider
from app.providers.mock_provider import MockProvider
from app.services.nlp_service import NlpService

logger = logging.getLogger(__name__)

_default_nlp: NlpService | None = None


def get_provider(api_key: str | None = None, model: str | None = None) -> BaseProvider:
    key = api_key or os.getenv("GROQ_API_KEY", "")
    resolved_model = model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    if key:
        try:
            from app.providers.groq_provider import GroqProvider
            logger.info(f"Using Groq provider with model {resolved_model}")
            return GroqProvider(api_key=key, model=resolved_model)
        except ImportError:
            logger.warning("groq package not found, falling back to MockProvider")

    logger.info("Using MockProvider")
    return MockProvider()


def get_nlp_service() -> NlpService:
    global _default_nlp
    if _default_nlp is None:
        _default_nlp = NlpService(provider=get_provider())
    return _default_nlp


def build_nlp_service_with_key(api_key: str, model: str | None = None) -> NlpService:
    """사용자 API 키로 1회성 NlpService 생성. 캐시 공유 없음."""
    return NlpService(provider=get_provider(api_key, model))
