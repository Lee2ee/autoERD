"""
Groq API 기반 provider.
규칙 기반 처리 후 AI 보조에만 사용.
"""
import asyncio
import json
import logging
from groq import AsyncGroq
from app.providers.base_provider import BaseProvider
from app.models.schemas import (
    EntityCandidate, RelationshipCandidate, BusinessRule, RateLimitInfo,
    EntityInput, NormalFormLevel, NormalizeResponse,
)


def _safe_int(val: str | None) -> int | None:
    try:
        return int(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def _parse_json_array(raw: str) -> list:
    """응답 문자열에서 JSON 배열을 파싱한다.
    rfind("]") + 1 방식의 off-by-one 오류를 방지하고, 누락 시 빈 배열 반환.
    """
    start = raw.find("[")
    end = raw.rfind("]")
    if start == -1 or end == -1 or end < start:
        return []
    return json.loads(raw[start:end + 1])


def _parse_json_object(raw: str) -> dict:
    """응답 문자열에서 JSON 객체를 파싱한다."""
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found")
    return json.loads(raw[start:end + 1])


import re
_CJK_RE = re.compile(r'[\u2E80-\u2EFF\u2F00-\u2FDF\u3000-\u303F\u31C0-\u31EF'
                     r'\u3200-\u32FF\u3300-\u33FF\u3400-\u4DBF\u4E00-\u9FFF'
                     r'\uF900-\uFAFF\u20000-\u2A6DF]')

def _strip_cjk(text: str) -> str:
    """한자(CJK) 문자를 제거하고 공백을 정리한다."""
    return _CJK_RE.sub('', text).strip()

logger = logging.getLogger(__name__)


AI_TEXT_LIMIT = 12000  # Groq 프롬프트에 전달할 최대 텍스트 길이

# Groq API 동시 호출을 1개로 제한 (429 방지)
# 프로세스 전체에서 공유되는 글로벌 세마포어
_groq_semaphore = asyncio.Semaphore(1)


class GroqProvider(BaseProvider):

    def __init__(self, api_key: str, model: str = "llama-3.3-70b-versatile"):
        self.client = AsyncGroq(api_key=api_key)
        self.model = model
        self._rate_limit: RateLimitInfo | None = None

    def _trim(self, text: str) -> str:
        """AI 호출 시 텍스트가 너무 길면 앞부분만 사용."""
        return text[:AI_TEXT_LIMIT] if len(text) > AI_TEXT_LIMIT else text

    def get_rate_limit(self) -> RateLimitInfo | None:
        return self._rate_limit

    async def _chat(self, system: str, user: str, max_tokens: int = 2048) -> str:
        async with _groq_semaphore:
            raw = await self.client.chat.completions.with_raw_response.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.3,
                max_tokens=max_tokens,
            )
        # rate limit 헤더 캡처
        h = raw.headers
        self._rate_limit = RateLimitInfo(
            limit_requests=_safe_int(h.get("x-ratelimit-limit-requests")),
            remaining_requests=_safe_int(h.get("x-ratelimit-remaining-requests")),
            limit_tokens=_safe_int(h.get("x-ratelimit-limit-tokens")),
            remaining_tokens=_safe_int(h.get("x-ratelimit-remaining-tokens")),
            reset_requests=h.get("x-ratelimit-reset-requests"),
            reset_tokens=h.get("x-ratelimit-reset-tokens"),
        )
        return (await raw.parse()).choices[0].message.content or ""

    async def extract_entities(self, text: str, candidates: list[str]) -> list[EntityCandidate]:
        if not candidates:
            return []

        system = (
            "You are a database modeling expert. "
            "Given Korean requirements text and noun candidates, "
            "identify actual domain entities (DB tables) and return enriched info as JSON. "
            "Rules:\n"
            "- Include ONLY nouns that represent real database tables (e.g. 사용자, 예약, 게시글, 파일)\n"
            "- EXCLUDE: adjectives, document title fragments, system names, policy/config words\n"
            "- EXCLUDE words like: 통합, 공공, 사항, 정의, 개요, 프로젝트, 정책, 관련, 분석, 단계\n"
            "- Return at most 15 most important entities\n"
            "- For each entity provide 5-8 relevant DB column names in Korean\n"
            "Output ONLY a valid JSON array, no explanation."
        )
        user = (
            f"Requirements:\n{self._trim(text)}\n\n"
            f"Noun candidates extracted from text: {json.dumps(candidates, ensure_ascii=False)}\n\n"
            "Identify REAL database entities from the requirements (not just from candidates). "
            "Return JSON array (max 15 entities):\n"
            '[{"name": "엔티티명", "description": "한국어 설명", "attributes": ["컬럼1", "컬럼2", "컬럼3"]}]'
        )

        try:
            # 엔티티 추출은 여러 엔티티 + 5~8개 속성 → 넉넉한 토큰 필요
            raw = await self._chat(system, user, max_tokens=3000)
            data = _parse_json_array(raw)
            if not data:
                raise ValueError(f"No JSON array found in response: {raw[:200]}")
            return [
                EntityCandidate(
                    name=_strip_cjk(item["name"]),
                    description=_strip_cjk(item.get("description", "") or ""),
                    attributes=[_strip_cjk(a) for a in item.get("attributes", [])],
                )
                for item in data if "name" in item
            ]
        except Exception as e:
            logger.error(f"Groq entity extraction failed: {type(e).__name__}: {e}")
            # fallback: 후보 목록 없이 빈 리스트 반환 (노이즈 엔티티 방지)
            # 사용자가 수동으로 추가하거나 AI 재시도를 할 수 있음
            return []

    async def suggest_attributes(self, entity_name: str, context: str) -> list[str]:
        system = "You are a database schema expert. Return only a JSON array of attribute name strings in Korean."
        user = f"Entity: {entity_name}\nContext: {context}\nSuggest 5-7 typical attributes."

        try:
            raw = await self._chat(system, user, max_tokens=300)
            return _parse_json_array(raw)
        except Exception as e:
            logger.warning(f"Groq attribute suggestion failed: {e}")
            return []

    async def infer_relationships(
        self, entities: list, text: str  # list[EntityCandidate] — 순환 import 방지로 타입 힌트 완화
    ) -> list[RelationshipCandidate]:
        if len(entities) < 2:
            return []

        # 엔티티 이름 + 속성 목록을 함께 전달하여 FK 패턴도 AI가 직접 판단
        entities_info = json.dumps(
            [{"name": e.name, "attributes": e.attributes} for e in entities],
            ensure_ascii=False,
        )

        system = (
            "You are a database modeling expert. "
            "Infer meaningful FK relationships between entities using two signals:\n"
            "1. Korean requirements text — explicit or implicit relationships\n"
            "2. Entity attributes — if an entity has an attribute like 'other_entity_id' "
            "or 'otherEntity', it implies a FK relationship\n"
            "Rules:\n"
            "- Include ALL relationships supported by either signal\n"
            "- Do NOT fabricate relationships with no evidence\n"
            "- Return at most 30 relationships\n"
            "Return ONLY valid JSON array, no explanation."
        )
        user = (
            f"Requirements text:\n{self._trim(text)}\n\n"
            f"Entities with attributes:\n{entities_info}\n\n"
            "Return JSON array:\n"
            '[{"source": "EntityA", "target": "EntityB", "type": "ONE_TO_MANY"}]\n'
            "Types: ONE_TO_ONE, ONE_TO_MANY, MANY_TO_ONE, MANY_TO_MANY"
        )

        try:
            raw = await self._chat(system, user, max_tokens=1000)
            data = _parse_json_array(raw)
            return [RelationshipCandidate(**item) for item in data if "source" in item and "target" in item]
        except Exception as e:
            logger.error(f"Groq relationship inference failed: {type(e).__name__}: {e}")
            return []

    async def normalize_entities(
        self, entities: list[EntityInput], level: NormalFormLevel
    ) -> NormalizeResponse:
        LEVEL_RULES = {
            "1NF": "각 컬럼은 원자값(더 이상 분리 불가)이어야 하고, 반복 그룹이 없어야 하며, 기본키가 있어야 한다.",
            "2NF": "1NF를 만족하고, 복합 기본키가 있을 경우 모든 비주요 속성이 기본키 전체에 완전 함수 종속이어야 한다 (부분 종속 제거).",
            "3NF": "2NF를 만족하고, 비주요 속성이 다른 비주요 속성에 이행적으로 종속되지 않아야 한다 (이행 종속 제거).",
            "BCNF": "3NF를 만족하고, 모든 함수적 종속의 결정자가 후보키여야 한다.",
        }
        system = (
            "You are a database normalization expert. "
            "Normalize the given entities to the specified normal form. "
            "You may split entities, remove redundant attributes, and infer FK relationships. "
            "Output ONLY valid JSON, no explanation."
        )
        entities_json = json.dumps(
            [{"name": e.name, "attributes": e.attributes} for e in entities],
            ensure_ascii=False
        )
        user = (
            f"Normalize to {level}: {LEVEL_RULES[level]}\n\n"
            f"Current entities:\n{entities_json}\n\n"
            "Return JSON object:\n"
            '{"entities": [{"name": "...", "description": "...", "attributes": ["..."]}], '
            '"relationships": [{"source": "...", "target": "...", "type": "ONE_TO_MANY"}], '
            '"changes": ["한국어로 변경 내용 설명"]}'
        )
        try:
            # 정규화는 여러 엔티티 재구성 → 충분한 토큰
            raw = await self._chat(system, user, max_tokens=3000)
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start == -1 or end == 0:
                raise ValueError("No JSON object found")
            data = json.loads(raw[start:end])
            return NormalizeResponse(
                entities=[
                    EntityCandidate(
                        name=_strip_cjk(e["name"]),
                        description=_strip_cjk(e.get("description", "") or ""),
                        attributes=[_strip_cjk(a) for a in e.get("attributes", [])],
                    )
                    for e in data.get("entities", []) if "name" in e
                ],
                relationships=[
                    RelationshipCandidate(**r)
                    for r in data.get("relationships", [])
                    if "source" in r and "target" in r
                ],
                changes=data.get("changes", []),
                rate_limit=self._rate_limit,
            )
        except Exception as e:
            logger.warning(f"Groq normalization failed: {e}")
            return NormalizeResponse(
                entities=[EntityCandidate(name=en.name, attributes=en.attributes) for en in entities],
                changes=[f"{level} 정규화 처리 중 오류가 발생했습니다."],
                rate_limit=self._rate_limit,
            )

    async def generate_description(self, entity_name: str, context: str) -> str:
        system = "Return only a single short description sentence in Korean for the given entity."
        user = f"Entity: {entity_name}\nContext: {context}"
        try:
            return (await self._chat(system, user)).strip()
        except Exception:
            return f"{entity_name} 정보"

    async def extract_business_rules(
        self, text: str, entities: list[str]
    ) -> list[BusinessRule]:
        if not entities:
            return []

        system = (
            "You are a database design expert. Extract business rules from Korean requirements text.\n"
            "Rule types and when to use:\n"
            "  CHECK: 값 범위/조건 제약 (e.g. price > 0)\n"
            "  UNIQUE: 중복 불가 제약\n"
            "  INDEX: 자주 조회되는 컬럼 인덱스 권장\n"
            "  CASCADE: FK 삭제 정책 (definition: CASCADE | RESTRICT | SET_NULL)\n"
            "  DEFAULT: 기본값 (definition: 실제 기본값)\n"
            "  ENUM: 허용값 목록 (definition: 쉼표 구분 값 목록)\n"
            "  NULLABLE: 필수/선택 (definition: NOT NULL | NULL)\n"
            "  AUDIT: 생성일시/수정일시 자동 기록 (definition: created_at,updated_at)\n"
            "Return ONLY valid JSON array, no explanation."
        )
        user = (
            f"Requirements:\n{self._trim(text)}\n\n"
            f"Entities: {json.dumps(entities, ensure_ascii=False)}\n\n"
            "Return JSON array:\n"
            '[{"entity": "엔티티명", "column": "컬럼명 or null", '
            '"rule_type": "CHECK", "definition": "amount > 0", "description": "한국어 설명"}]'
        )

        try:
            # 업무 규칙은 항목당 짧은 JSON → 1000 토큰이면 충분
            raw = await self._chat(system, user, max_tokens=1000)
            data = _parse_json_array(raw)
            return [
                BusinessRule(**item)
                for item in data
                if "entity" in item and "rule_type" in item and "definition" in item
            ]
        except Exception as e:
            logger.error(f"Groq business rule extraction failed: {type(e).__name__}: {e}")
            return []
