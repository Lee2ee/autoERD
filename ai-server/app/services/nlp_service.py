"""
NLP 처리 서비스.
1차: 규칙 기반 (Kiwi 형태소 분석 + 불용어 필터)
2차: AI 보조 (속성 추천, 설명 생성, 관계 보정)
"""
import hashlib
import logging
from app.models.schemas import AnalyzeResponse, EntityCandidate, RelationshipCandidate
from app.providers.base_provider import BaseProvider

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
STOPWORDS = {
    "처리", "진행", "기능", "관리", "내역", "여부", "상태처리",
    "정보", "시스템", "서비스", "데이터", "관련", "통해", "위해",
    "경우", "때", "것", "수", "이", "그", "저", "이것", "저것",
    "있다", "한다", "된다", "하다", "이다", "없다", "되다",
}

# 명사 + 업무 분야 필터 (최소 2자 이상, 업무 명사만)
MIN_NOUN_LEN = 2

# 관계 패턴 (동사/조사 기반 추론)
RELATION_PATTERNS = [
    # (앞 엔티티 후치사, 뒤 엔티티 후치사, 관계타입)
    (["은", "는", "이", "가"], ["여러", "다수의", "많은"], "ONE_TO_MANY"),
    (["여러", "다수의", "많은"], [], "MANY_TO_ONE"),
    (["은", "는"], ["하나의", "1개의"], "MANY_TO_ONE"),
]

# 관계 동사 → 관계 타입
RELATION_VERBS = {
    "주문": "ONE_TO_MANY",
    "포함": "ONE_TO_MANY",
    "가진": "ONE_TO_MANY",
    "속한": "MANY_TO_ONE",
    "결제": "ONE_TO_ONE",
    "배송": "ONE_TO_ONE",
}


class NlpService:

    def __init__(self, provider: BaseProvider, cache: dict | None = None):
        self.provider = provider
        self.cache: dict[str, AnalyzeResponse] = cache or {}

    async def analyze(self, text: str) -> AnalyzeResponse:
        cache_key = hashlib.md5(text.encode()).hexdigest()
        if cache_key in self.cache:
            logger.debug(f"Cache hit for key {cache_key}")
            return self.cache[cache_key]

        # 1차: 규칙 기반
        nouns = self._extract_nouns(text)
        entity_candidates = self._filter_entities(nouns)
        rule_relationships = self._extract_relationships(text, entity_candidates)

        logger.debug(f"Rule-based candidates: {entity_candidates}")

        # 2차: AI 보조 (엔티티 보정 + 속성 추천)
        ai_entities = await self.provider.extract_entities(text, entity_candidates)

        # AI 관계 추론 (규칙 기반 결과와 병합)
        ai_relationships = await self.provider.infer_relationships(entity_candidates, text)

        # 관계 병합 (중복 제거)
        merged_relationships = self._merge_relationships(rule_relationships, ai_relationships)

        result = AnalyzeResponse(
            entities=ai_entities,
            relationships=merged_relationships,
            recommendations=self._generate_recommendations(entity_candidates, merged_relationships),
        )

        self.cache[cache_key] = result
        return result

    def _extract_nouns(self, text: str) -> list[str]:
        """Kiwi 형태소 분석으로 명사 추출."""
        try:
            kiwi = get_kiwi()
            result = kiwi.analyze(text)
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

    def _filter_entities(self, nouns: list[str]) -> list[str]:
        """불용어 제거 및 중복 제거."""
        seen = set()
        result = []
        for noun in nouns:
            if noun not in STOPWORDS and noun not in seen:
                seen.add(noun)
                result.append(noun)
        return result

    def _extract_relationships(
        self, text: str, entities: list[str]
    ) -> list[RelationshipCandidate]:
        """규칙 기반 관계 추론."""
        relationships = []

        # 패턴: "A는 여러 B를 가진다" → A 1:N B
        for verb, rel_type in RELATION_VERBS.items():
            if verb in text:
                for i, src in enumerate(entities):
                    for tgt in entities[i + 1:]:
                        if src in text and tgt in text:
                            src_pos = text.find(src)
                            tgt_pos = text.find(tgt)
                            verb_pos = text.find(verb)
                            if src_pos < verb_pos < tgt_pos or src_pos < tgt_pos < verb_pos:
                                relationships.append(
                                    RelationshipCandidate(
                                        source=src,
                                        target=tgt,
                                        type=rel_type,  # type: ignore
                                    )
                                )
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
