"""
NLP 처리 서비스.
1차: 규칙 기반 (Kiwi 형태소 분석 + 불용어 필터)
2차: AI 보조 (속성 추천, 설명 생성, 관계 보정, 업무 규칙 추출)
"""
import hashlib
import logging
import re
from collections import OrderedDict
from app.models.schemas import AnalyzeResponse, EntityCandidate, RelationshipCandidate, BusinessRule
from app.providers.base_provider import BaseProvider

KIWI_TEXT_LIMIT = 20000     # Kiwi 형태소 분석 최대 입력 길이 (OOM 방지)
MAX_ENTITY_CANDIDATES = 30  # 엔티티 후보 최대 수 (관계 탐색 O(n²) 방지)
MAX_CACHE_SIZE = 100        # 캐시 최대 항목 수 (메모리 무한 증가 방지)

logger = logging.getLogger(__name__)

# kiwipiepy optional import (Windows에서 MSVC 없으면 설치 불가)
try:
    from kiwipiepy import Kiwi as _KiwiClass
    _KIWI_AVAILABLE = True
except ImportError:
    _KiwiClass = None  # type: ignore
    _KIWI_AVAILABLE = False
    logger.warning("kiwipiepy를 찾을 수 없습니다. simple tokenizer로 폴백합니다.")

_kiwi = None


def get_kiwi():
    global _kiwi
    if not _KIWI_AVAILABLE:
        raise ImportError("kiwipiepy not installed")
    if _kiwi is None:
        _kiwi = _KiwiClass()
    return _kiwi


# 불용어 목록
# - 도메인 무관 언어적 추상명사: 어떤 도메인에서도 DB 엔티티가 될 수 없는 순수 언어 단어
STOPWORDS = {
    # 기존 기능어/시스템어
    "처리", "진행", "기능", "관리", "내역", "여부", "상태처리",
    "정보", "시스템", "서비스", "데이터", "관련", "통해", "위해",
    "경우", "때", "것", "수", "이", "그", "저", "이것", "저것",
    "있다", "한다", "된다", "하다", "이다", "없다", "되다",
    # 상태/가능성/존재 추상명사 (DB 테이블이 될 수 없음)
    "가능", "불가", "존재", "부재", "여부", "상태",
    # 동작/행위 명사 (하다/되다 생략형 — 단문에서 Kiwi가 NNG로 오분류)
    "고정", "해제", "허용", "차단", "지원", "제한", "설정",
    "확인", "변경", "삭제", "등록", "수정", "조회", "검색",
    # 위치/방향
    "상단", "하단", "좌측", "우측", "중앙",
    # 비교/정도
    "다름", "같음", "이상", "이하", "초과", "미만", "최대", "최소",
    # 수량/단위 일반어
    "형", "별", "마다", "단계", "방식", "방법", "종류", "기준",
}

# 명사 + 업무 분야 필터 (최소 2자 이상, 업무 명사만)
MIN_NOUN_LEN = 2

# ── 업무 규칙 키워드 ─────────────────────────────────────────
# AUDIT: 이력/타임스탬프 언급 시 모든 엔티티에 적용
AUDIT_KEYWORDS = ["생성일", "수정일", "등록일", "변경일", "이력", "타임스탬프", "일시 기록"]

# CASCADE: 삭제 정책
CASCADE_DELETE_KEYWORDS = ["같이 삭제", "연쇄 삭제", "함께 삭제", "자동 삭제", "삭제되면 삭제"]
CASCADE_RESTRICT_KEYWORDS = ["삭제 시 보존", "탈퇴 시 보존", "삭제 불가", "보존해야", "유지해야"]

# UNIQUE: 중복 불가
UNIQUE_KEYWORDS = ["중복 불가", "중복불가", "유일해야", "고유해야", "유니크"]

# NULLABLE: 필수/선택
REQUIRED_KEYWORDS = ["필수 입력", "반드시 입력", "필수여야"]
OPTIONAL_KEYWORDS = ["선택사항", "없을 수도", "선택적으로", "선택 입력"]


class NlpService:

    def __init__(self, provider: BaseProvider, cache: OrderedDict | None = None):
        self.provider = provider
        self.cache: OrderedDict[str, AnalyzeResponse] = cache if cache is not None else OrderedDict()

    async def analyze(self, text: str) -> AnalyzeResponse:
        cache_key = hashlib.md5(text.encode()).hexdigest()
        if cache_key in self.cache:
            logger.debug(f"Cache hit for key {cache_key}")
            return self.cache[cache_key]

        # 1차: 규칙 기반 엔티티 후보 추출 (Kiwi 명사 분석)
        nouns = self._extract_nouns(text)
        entity_candidates = self._filter_entities(nouns, text)

        logger.debug(f"Rule-based candidates: {entity_candidates}")

        # 2차: AI 보조 - 순차 호출 (동시 호출 시 Groq 레이트리밋 429 발생)
        rule_based_rules = self._extract_rule_based_rules(text, entity_candidates)
        ai_entities = await self.provider.extract_entities(text, entity_candidates)

        if not ai_entities:
            # Groq 실패 시 → Kiwi 후보 중 주어명사 우선으로 폴백 (노이즈 최소화)
            logger.warning("AI entity extraction returned empty, falling back to rule-based candidates")
            _, subject_nouns = self._detect_action_nouns_and_subjects(text)
            fallback_candidates = (
                [EntityCandidate(name=n) for n in entity_candidates if n in subject_nouns]
                or [EntityCandidate(name=n) for n in entity_candidates]
            )
            ai_entities = fallback_candidates

        # 관계 추론: Groq가 텍스트 + 엔티티 속성(FK 패턴 포함) 기반으로 동적 판단
        ai_entity_names = [e.name for e in ai_entities]
        ai_relationships = await self.provider.infer_relationships(ai_entities, text)
        ai_rules = await self.provider.extract_business_rules(text, ai_entity_names)

        # FK 패턴 기반 보완 (Groq 실패 시 안전망 — 도메인 무관, 순수 패턴 매칭)
        fk_relationships = self._infer_fk_relationships(ai_entities)
        merged_relationships = self._merge_relationships(ai_relationships, fk_relationships)

        # 업무 규칙 병합
        merged_rules = self._merge_business_rules(rule_based_rules, ai_rules)

        result = AnalyzeResponse(
            entities=ai_entities,
            relationships=merged_relationships,
            recommendations=self._generate_recommendations(ai_entity_names, merged_relationships),
            business_rules=merged_rules,
            rate_limit=self.provider.get_rate_limit(),
        )

        # LRU 캐시: 최대 크기 초과 시 가장 오래된 항목 제거
        if len(self.cache) >= MAX_CACHE_SIZE:
            self.cache.popitem(last=False)
        self.cache[cache_key] = result
        return result

    def _extract_nouns(self, text: str) -> list[str]:
        """Kiwi 형태소 분석으로 명사 추출. 긴 텍스트는 앞부분만 분석 (OOM 방지)."""
        try:
            kiwi = get_kiwi()
            result = kiwi.analyze(text[:KIWI_TEXT_LIMIT])
            nouns = []
            for token in result[0][0]:
                if token.tag in ("NNG", "NNP") and len(token.form) >= MIN_NOUN_LEN:
                    nouns.append(token.form)
            return nouns
        except Exception as e:
            logger.warning(f"Kiwi analysis failed: {e}, fallback to simple split")
            return self._simple_noun_extract(text)

    def _simple_noun_extract(self, text: str) -> list[str]:
        """Kiwi 실패 시 간단한 공백 분리 방식."""
        words = text.replace(",", " ").replace(".", " ").split()
        return [w for w in words if len(w) >= MIN_NOUN_LEN]

    def _detect_action_nouns_and_subjects(self, text: str) -> tuple[set[str], set[str]]:
        """Kiwi 형태소 분석으로 행위명사와 주어 명사를 동적 탐지.

        - 행위명사: NNG/NNP 다음에 XSV(동사 파생 접미사)가 오는 경우
            예) 확정/NNG + 되/XSV → '확정'은 행위명사
                승인/NNG + 하/XSV → '승인'은 행위명사
        - 주어 명사: NNG/NNP 다음에 JKS(주격조사) 또는 JX(보조사)가 오는 경우
            예) 예약/NNG + 은/JX  → '예약'은 주어 역할 (실체명사)
                시설/NNG + 마다/JX → '시설'은 주어 역할 (실체명사)
        """
        action_nouns: set[str] = set()
        subject_nouns: set[str] = set()
        try:
            kiwi = get_kiwi()
            result = kiwi.analyze(text[:KIWI_TEXT_LIMIT])
            tokens = result[0][0]
            for i, token in enumerate(tokens):
                if token.tag not in ('NNG', 'NNP') or i + 1 >= len(tokens):
                    continue
                next_tag = tokens[i + 1].tag
                if next_tag == 'XSV':
                    # 동사 파생 접미사 결합 → 행위명사 (확정되다, 승인하다, 취소되다)
                    action_nouns.add(token.form)
                elif next_tag in ('JKS', 'JX'):
                    # 주격/보조사 결합 → 주어 역할 실체명사 (예약은, 시설마다)
                    subject_nouns.add(token.form)
        except Exception as e:
            logger.debug(f"Action/subject detection failed: {e}")
        return action_nouns, subject_nouns

    def _filter_entities(self, nouns: list[str], text: str = "") -> list[str]:
        """행위명사 제거, 주어 명사 우선 배치, 불용어/중복 제거."""
        action_nouns, subject_nouns = (
            self._detect_action_nouns_and_subjects(text) if text else (set(), set())
        )
        logger.debug(f"Action nouns: {action_nouns}, Subject nouns: {subject_nouns}")

        seen: set[str] = set()
        subjects: list[str] = []
        others: list[str] = []

        for noun in nouns:
            if noun in STOPWORDS or noun in seen or noun in action_nouns:
                continue
            seen.add(noun)
            if noun in subject_nouns:
                subjects.append(noun)
            else:
                others.append(noun)

        return (subjects + others)[:MAX_ENTITY_CANDIDATES]

    @staticmethod
    def _to_snake(name: str) -> str:
        """엔티티 이름을 snake_case FK 패턴으로 변환. 예: OrderItem → order_item, 게시글 → 게시글"""
        s = re.sub(r'([A-Z])', r'_\1', name).lower().strip('_')
        return re.sub(r'\s+', '_', s)

    def _infer_fk_relationships(
        self, entities: list[EntityCandidate]
    ) -> list[RelationshipCandidate]:
        """엔티티 속성 이름에서 FK 패턴을 찾아 관계를 추론한다.

        예) 파일 엔티티에 '게시글_id' 속성이 있으면 → 파일 MANY_TO_ONE 게시글
        패턴: {other}_id, {other}Id, {other_snake}_id (대소문자 무관)
        """
        relationships = []
        seen: set[tuple[str, str]] = set()

        for entity in entities:
            for other in entities:
                if other.name == entity.name:
                    continue
                other_snake = self._to_snake(other.name)
                # 매칭할 FK 패턴 목록
                fk_patterns = {
                    f"{other.name}_id",
                    f"{other.name}id",
                    f"{other_snake}_id",
                    f"{other_snake}id",
                    other.name,       # 외래키가 엔티티명 자체인 경우
                }
                for attr in entity.attributes:
                    attr_lower = attr.lower().replace(" ", "_")
                    if attr_lower in {p.lower() for p in fk_patterns}:
                        key = (entity.name, other.name)
                        if key not in seen:
                            seen.add(key)
                            relationships.append(RelationshipCandidate(
                                source=entity.name,
                                target=other.name,
                                type="MANY_TO_ONE",
                            ))
                            logger.debug(f"FK inference: {entity.name}.{attr} → {other.name}")
                        break

        return relationships

    def _merge_relationships(
        self,
        rule: list[RelationshipCandidate],
        ai: list[RelationshipCandidate],
    ) -> list[RelationshipCandidate]:
        """규칙 기반 결과 우선, AI 결과로 보완."""
        seen = {(r.source, r.target) for r in rule}
        result = list(rule)
        for r in ai:
            if (r.source, r.target) not in seen:
                seen.add((r.source, r.target))
                result.append(r)
        return result

    def _generate_recommendations(
        self, entities: list[str], relationships: list[RelationshipCandidate]
    ) -> list[str]:
        """누락 엔티티 또는 중간 테이블 추천."""
        recommendations = []
        for rel in relationships:
            if rel.type == "MANY_TO_MANY":
                recommendations.append(
                    f"'{rel.source}'과 '{rel.target}' 사이에 중간 테이블을 추천합니다."
                )
        return recommendations

    def _extract_rule_based_rules(
        self, text: str, entities: list[str]
    ) -> list[BusinessRule]:
        """키워드 기반 업무 규칙 추출."""
        rules: list[BusinessRule] = []

        # AUDIT: 이력/타임스탬프 언급 시 모든 엔티티에 적용
        if any(kw in text for kw in AUDIT_KEYWORDS):
            for entity in entities:
                rules.append(BusinessRule(
                    entity=entity,
                    column=None,
                    rule_type="AUDIT",
                    definition="created_at,updated_at",
                    description=f"{entity}의 생성일시/수정일시 자동 기록",
                ))

        # CASCADE RESTRICT: 삭제 시 보존
        if any(kw in text for kw in CASCADE_RESTRICT_KEYWORDS):
            for entity in entities:
                rules.append(BusinessRule(
                    entity=entity,
                    column=None,
                    rule_type="CASCADE",
                    definition="RESTRICT",
                    description=f"부모 데이터 삭제 시 {entity} 보존",
                ))

        # CASCADE DELETE: 연쇄 삭제
        if any(kw in text for kw in CASCADE_DELETE_KEYWORDS):
            for entity in entities:
                rules.append(BusinessRule(
                    entity=entity,
                    column=None,
                    rule_type="CASCADE",
                    definition="CASCADE",
                    description=f"부모 데이터 삭제 시 {entity}도 함께 삭제",
                ))

        return rules

    def _merge_business_rules(
        self,
        rule_based: list[BusinessRule],
        ai: list[BusinessRule],
    ) -> list[BusinessRule]:
        """AI 결과 우선, 규칙 기반으로 보완. (entity+column+rule_type) 기준 중복 제거."""
        seen: set[tuple] = set()
        result: list[BusinessRule] = []

        # AI 결과 우선
        for r in ai:
            key = (r.entity, r.column, r.rule_type)
            if key not in seen:
                seen.add(key)
                result.append(r)

        # 규칙 기반으로 보완 (AI가 놓친 것만)
        for r in rule_based:
            key = (r.entity, r.column, r.rule_type)
            if key not in seen:
                seen.add(key)
                result.append(r)

        return result
