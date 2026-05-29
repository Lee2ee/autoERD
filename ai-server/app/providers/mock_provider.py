"""
Mock provider: Groq API 없이 동작하는 기본 제공자.
개발/테스트 환경 또는 API 키가 없을 때 사용.
"""
from app.providers.base_provider import BaseProvider
from app.models.schemas import (
    EntityCandidate, RelationshipCandidate, BusinessRule, RateLimitInfo,
    EntityInput, NormalFormLevel, NormalizeResponse,
)

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

# 엔티티별 기본 업무 규칙 (Mock 용)
ENTITY_BUSINESS_RULES: dict[str, list[dict]] = {
    "회원": [
        {"column": "이메일", "rule_type": "UNIQUE", "definition": "unique", "description": "이메일은 중복 불가"},
        {"column": "이메일", "rule_type": "NULLABLE", "definition": "NOT NULL", "description": "이메일은 필수 입력"},
        {"column": None, "rule_type": "AUDIT", "definition": "created_at,updated_at", "description": "가입일시/수정일시 자동 기록"},
    ],
    "사용자": [
        {"column": "이메일", "rule_type": "UNIQUE", "definition": "unique", "description": "이메일은 중복 불가"},
        {"column": None, "rule_type": "AUDIT", "definition": "created_at,updated_at", "description": "생성일시/수정일시 자동 기록"},
    ],
    "상품": [
        {"column": "가격", "rule_type": "CHECK", "definition": "가격 > 0", "description": "가격은 0보다 커야 함"},
        {"column": "재고수량", "rule_type": "CHECK", "definition": "재고수량 >= 0", "description": "재고는 음수 불가"},
        {"column": "카테고리", "rule_type": "INDEX", "definition": "카테고리", "description": "카테고리별 상품 조회 최적화"},
        {"column": None, "rule_type": "AUDIT", "definition": "created_at,updated_at", "description": "등록일시/수정일시 자동 기록"},
    ],
    "주문": [
        {"column": "총금액", "rule_type": "CHECK", "definition": "총금액 > 0", "description": "주문금액은 양수여야 함"},
        {"column": "상태", "rule_type": "ENUM", "definition": "대기,진행중,완료,취소", "description": "주문 상태는 지정된 값 중 하나"},
        {"column": None, "rule_type": "CASCADE", "definition": "RESTRICT", "description": "회원 탈퇴 시 주문 내역 보존"},
        {"column": None, "rule_type": "AUDIT", "definition": "created_at,updated_at", "description": "주문일시/수정일시 자동 기록"},
    ],
    "배송": [
        {"column": "배송상태", "rule_type": "ENUM", "definition": "준비중,배송중,배송완료,반송", "description": "배송 상태는 지정된 값 중 하나"},
        {"column": None, "rule_type": "CASCADE", "definition": "CASCADE", "description": "주문 삭제 시 배송 정보도 삭제"},
        {"column": None, "rule_type": "AUDIT", "definition": "created_at,updated_at", "description": "배송일시 자동 기록"},
    ],
    "결제": [
        {"column": "결제금액", "rule_type": "CHECK", "definition": "결제금액 > 0", "description": "결제금액은 양수여야 함"},
        {"column": "결제방법", "rule_type": "ENUM", "definition": "카드,계좌이체,간편결제,쿠폰", "description": "결제방법은 지정된 값 중 하나"},
        {"column": None, "rule_type": "CASCADE", "definition": "CASCADE", "description": "주문 삭제 시 결제 정보도 삭제"},
        {"column": None, "rule_type": "AUDIT", "definition": "created_at,updated_at", "description": "결제일시 자동 기록"},
    ],
    "쿠폰": [
        {"column": "할인율", "rule_type": "CHECK", "definition": "할인율 > 0 AND 할인율 <= 100", "description": "할인율은 1~100 사이여야 함"},
        {"column": None, "rule_type": "AUDIT", "definition": "created_at,updated_at", "description": "등록일시 자동 기록"},
    ],
    "리뷰": [
        {"column": "평점", "rule_type": "CHECK", "definition": "평점 >= 1 AND 평점 <= 5", "description": "평점은 1~5 사이여야 함"},
        {"column": None, "rule_type": "AUDIT", "definition": "created_at,updated_at", "description": "작성일시 자동 기록"},
    ],
}


class MockProvider(BaseProvider):

    # Mock: 고정값으로 rate limit 정보 반환 (실제 API 없이도 UI 확인 가능)
    def get_rate_limit(self) -> RateLimitInfo:
        return RateLimitInfo(
            limit_requests=30,
            remaining_requests=30,
            limit_tokens=6000,
            remaining_tokens=6000,
            reset_requests="1m0s",
            reset_tokens="1m0s",
        )

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

    async def normalize_entities(
        self, entities: list[EntityInput], level: NormalFormLevel
    ) -> NormalizeResponse:
        # Mock: 원본 그대로 반환 + 안내 메시지
        return NormalizeResponse(
            entities=[
                EntityCandidate(name=e.name, description=f"{e.name} 정보", attributes=e.attributes)
                for e in entities
            ],
            changes=[f"[Mock] {level} 정규화 미리보기 — Groq API 키 설정 시 실제 정규화가 적용됩니다."],
        )

    async def extract_business_rules(
        self, text: str, entities: list[str]
    ) -> list[BusinessRule]:
        rules = []
        for entity in entities:
            entity_rules = ENTITY_BUSINESS_RULES.get(entity, [
                {"column": None, "rule_type": "AUDIT", "definition": "created_at,updated_at",
                 "description": f"{entity}의 생성일시/수정일시 자동 기록"},
            ])
            for r in entity_rules:
                rules.append(BusinessRule(entity=entity, **r))
        return rules
