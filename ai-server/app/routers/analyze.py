from fastapi import APIRouter, Depends, Header
from typing import Optional
from app.models.schemas import AnalyzeRequest, AnalyzeResponse
from app.services.nlp_service import NlpService
from app.dependencies import get_nlp_service, build_nlp_service_with_key

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: AnalyzeRequest,
    x_groq_api_key: Optional[str] = Header(default=None),
    x_groq_model: Optional[str] = Header(default=None),
    nlp: NlpService = Depends(get_nlp_service),
) -> AnalyzeResponse:
    # 사용자 API 키가 헤더로 전달된 경우 해당 키로 동적 서비스 사용
    if x_groq_api_key:
        service = build_nlp_service_with_key(x_groq_api_key, x_groq_model)
        return await service.analyze(request.text)
    return await nlp.analyze(request.text)
