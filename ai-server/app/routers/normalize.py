from fastapi import APIRouter, Depends, Header
from typing import Optional
from app.models.schemas import NormalizeRequest, NormalizeResponse
from app.dependencies import get_nlp_service, build_nlp_service_with_key

router = APIRouter()


@router.post("/normalize", response_model=NormalizeResponse)
async def normalize(
    request: NormalizeRequest,
    x_groq_api_key: Optional[str] = Header(default=None),
    x_groq_model: Optional[str] = Header(default=None),
    nlp=Depends(get_nlp_service),
) -> NormalizeResponse:
    provider = (
        build_nlp_service_with_key(x_groq_api_key, x_groq_model).provider
        if x_groq_api_key
        else nlp.provider
    )
    result = await provider.normalize_entities(request.entities, request.level)
    result.rate_limit = provider.get_rate_limit()
    return result
