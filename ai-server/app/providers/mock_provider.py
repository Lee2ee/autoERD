"""
Mock provider: Groq API 없이 동작하는 기본 제공자.
개발/테스트 환경 또는 API 키가 없을 때 사용.
"""
from app.providers.base_provider import BaseProvider
from app.models.schemas import EntityCandidate, RelationshipCandidate

ENTITY_ATTRIBUTES: dict[str, list[str]] = {
    "회원": ["회원명", "이메일", "비밀번호", "전화번호", "가입일시"],
    "사용자": ["사용자명", "이메일", "비밀번호", "생성일시"],
    "상품": ["상품명", "가격", "재고수량", "카테고리", "설명"],
    "주문": ["주문일시", "상태", "총금액", "배송주소"],
    "배송": ["배송지", "배송상태", "배송일시", "운송장번호"],
    "결제": ["결제금액", "결제방법", "결제일시", "승인번호"],
    "카테고리": ["카테고리명", "설명"],
    "리뷰": ["평점", "내용", "작성일시"],
    "쿠폰": ["쿠폰코드", "할인율", "만료일"],
}

ENTITY_DESCRIPTIONS: dict[str, str] = {
    "회원": "서비스에 가입한 사용자",
    "사용자": "시스템 사용자",
    "상품": "판매 상품 정보",
    "주문": "회원의 상품 주문 정보",
    "배송": "주문 배송 정보",
    "결제": "주문 결제 정보",
    "카테고리": "상품 분류 카테고리",
    "리뷰": "상품 리뷰 정보",
    "쿠폰": "할인 쿠폰 정보",
}


class MockProvider(BaseProvider):

    async def extract_entities(self, text: str, candidates: list[str]) -> list[EntityCandidate]:
        result = []
        for name in candidates:
            attrs = ENTITY_ATTRIBUTES.get(name, ["이름", "설명", "생성일시"])
            desc = ENTITY_DESCRIPTIONS.get(name, f"{name} 정보")
            result.append(EntityCandidate(name=name, description=desc, attributes=attrs))
        return result

    async def suggest_attributes(self, entity_name: str, context: str) -> list[str]:
        return ENTITY_ATTRIBUTES.get(entity_name, ["이름", "설명", "생성일시"])

    async def infer_relationships(
        self, entities: list[str], text: str
    ) -> list[RelationshipCandidate]:
        return []

    async def generate_description(self, entity_name: str, context: str) -> str:
        return ENTITY_DESCRIPTIONS.get(entity_name, f"{entity_name} 관련 정보")
