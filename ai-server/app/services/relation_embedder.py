"""
임베딩 유사도 기반 관계 분류기.

예시 문장 로드 우선순위:
  1. examples_cache.json 파일 (캐시)
  2. Groq API로 자동 생성 후 캐시 저장 (GROQ_API_KEY 필요)
  3. 코드 내 최소 폴백 예시

sentence-transformers 모델로 문맥 문장을 인코딩하고
관계 타입별 예시 문장의 평균 벡터(prototype)와 코사인 유사도를 비교해 관계를 분류한다.
"""

import json
import logging
import os
import numpy as np
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from sentence_transformers import SentenceTransformer
    _ST_AVAILABLE = True
except ImportError:
    _ST_AVAILABLE = False
    logger.warning("sentence-transformers 없음. 임베딩 관계 분류를 건너뜁니다.")

CACHE_PATH = Path(__file__).parent / "examples_cache.json"

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
SIMILARITY_THRESHOLD = 0.40

# Groq 생성 실패 시 사용하는 최소 폴백
_FALLBACK_EXAMPLES: dict[str, list[str]] = {
    "ONE_TO_MANY": [
        "하나의 회원은 여러 주문을 가질 수 있다",
        "카테고리는 여러 상품을 포함한다",
        "부서는 여러 직원을 관리한다",
        "게시글 하나에 여러 댓글이 달린다",
        "하나의 주문에 여러 상품이 포함된다",
    ],
    "MANY_TO_ONE": [
        "주문은 하나의 회원에 속한다",
        "상품은 하나의 카테고리에 분류된다",
        "직원은 하나의 부서에 귀속된다",
        "댓글은 하나의 게시글에 달린다",
        "태스크는 하나의 프로젝트에 속한다",
    ],
    "ONE_TO_ONE": [
        "주문과 결제는 일대일로 대응된다",
        "사용자는 하나의 프로필을 가진다",
        "주문 하나에 배송 정보 하나가 매핑된다",
        "각 직원은 하나의 사원증을 가진다",
        "예약 하나에 좌석 하나가 대응된다",
    ],
    "MANY_TO_MANY": [
        "학생은 여러 강의를 수강하고 강의도 여러 학생을 가진다",
        "상품은 여러 태그를 가지고 태그도 여러 상품에 적용된다",
        "사용자는 여러 그룹에 참여하고 그룹도 여러 사용자를 포함한다",
        "학생과 과목은 다대다 관계다",
        "직원은 여러 프로젝트에 참여하고 프로젝트도 여러 직원을 가진다",
    ],
}

_RELATION_DESCRIPTIONS = {
    "ONE_TO_MANY": "하나의 엔티티가 여러 다른 엔티티를 소유하거나 포함하는 관계. 예: 회원-주문, 부서-직원, 게시글-댓글",
    "MANY_TO_ONE": "여러 엔티티가 하나의 엔티티에 속하거나 참조하는 관계. 예: 주문-회원, 직원-부서, 댓글-게시글",
    "ONE_TO_ONE": "정확히 하나와 하나가 일대일로 대응되는 관계. 예: 주문-결제, 사용자-프로필, 주문-배송정보",
    "MANY_TO_MANY": "양쪽 모두 여러 개와 연결될 수 있는 다대다 관계. 예: 학생-강의, 상품-태그, 직원-프로젝트",
}


def _generate_with_groq(api_key: str) -> dict[str, list[str]]:
    """Groq API로 관계 타입별 예시 문장을 생성한다 (동기 호출, 최초 1회)."""
    from groq import Groq  # sync client

    client = Groq(api_key=api_key)
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    rel_desc = "\n".join(f"- {k}: {v}" for k, v in _RELATION_DESCRIPTIONS.items())

    system = (
        "You are a database modeling expert and Korean NLP specialist. "
        "Generate Korean example sentences that express database entity relationships. "
        "Return ONLY valid JSON, no explanation."
    )
    user = (
        "Generate 60 Korean example sentences for each of the following database relationship types.\n\n"
        f"Relationship types:\n{rel_desc}\n\n"
        "Requirements:\n"
        "- Use diverse domains: e-commerce, community, HR, education, healthcare, finance, logistics, media, etc.\n"
        "- Use diverse Korean expressions and verb forms (가진다/보유한다/포함한다/속한다 etc.)\n"
        "- Each sentence must clearly express the relationship type\n"
        "- Sentences should be 10~30 characters long\n\n"
        "Return JSON:\n"
        '{"ONE_TO_MANY": ["sentence1", ...], "MANY_TO_ONE": [...], "ONE_TO_ONE": [...], "MANY_TO_MANY": [...]}'
    )

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.7,
        max_tokens=4000,
    )

    raw = response.choices[0].message.content or ""
    start, end = raw.find("{"), raw.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("JSON not found in Groq response")

    data: dict[str, list[str]] = json.loads(raw[start:end])

    # 반드시 4개 키가 모두 있어야 함
    for key in _FALLBACK_EXAMPLES:
        if key not in data or not isinstance(data[key], list) or len(data[key]) == 0:
            raise ValueError(f"Missing or empty key: {key}")

    return data


def _load_examples() -> dict[str, list[str]]:
    """예시 문장을 캐시 → Groq 생성 → 폴백 순으로 로드한다."""
    # 1) 캐시 파일
    if CACHE_PATH.exists():
        try:
            data = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
            total = sum(len(v) for v in data.values())
            logger.info(f"예시 문장 캐시 로드: {CACHE_PATH} ({total}개)")
            return data
        except Exception as e:
            logger.warning(f"캐시 로드 실패, 재생성합니다: {e}")

    # 2) Groq 자동 생성
    api_key = os.getenv("GROQ_API_KEY", "")
    if api_key:
        try:
            logger.info("Groq로 관계 예시 문장 생성 중...")
            data = _generate_with_groq(api_key)
            CACHE_PATH.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            total = sum(len(v) for v in data.values())
            logger.info(f"예시 문장 생성 완료 ({total}개) → {CACHE_PATH} 저장")
            return data
        except Exception as e:
            logger.warning(f"Groq 생성 실패, 폴백 예시를 사용합니다: {e}")

    # 3) 폴백
    logger.info("폴백 예시 문장 사용 (GROQ_API_KEY 없음)")
    return _FALLBACK_EXAMPLES


class RelationEmbedder:
    """임베딩 유사도로 문맥 문장의 관계 타입을 분류한다."""

    def __init__(self) -> None:
        self._model: Optional[SentenceTransformer] = None  # type: ignore
        self._prototypes: Optional[dict[str, np.ndarray]] = None

    def _load(self) -> bool:
        if not _ST_AVAILABLE:
            return False
        if self._model is not None:
            return True
        try:
            examples = _load_examples()
            self._model = SentenceTransformer(MODEL_NAME)
            self._prototypes = {}
            for rel_type, sentences in examples.items():
                vecs = self._model.encode(sentences, convert_to_numpy=True)
                self._prototypes[rel_type] = vecs.mean(axis=0)
            total = sum(len(v) for v in examples.values())
            logger.info(f"RelationEmbedder 로드 완료: {MODEL_NAME}, 예시 {total}개")
            return True
        except Exception as e:
            logger.error(f"RelationEmbedder 로드 실패: {e}")
            return False

    @staticmethod
    def _cosine(a: np.ndarray, b: np.ndarray) -> float:
        denom = np.linalg.norm(a) * np.linalg.norm(b)
        return float(np.dot(a, b) / (denom + 1e-8))

    def classify(self, context: str) -> Optional[tuple[str, float]]:
        """
        문맥 문장을 받아 (관계 타입, 유사도) 를 반환한다.
        유사도가 SIMILARITY_THRESHOLD 미만이거나 모델 로드 실패 시 None 반환.
        """
        if not self._load():
            return None
        try:
            vec = self._model.encode([context], convert_to_numpy=True)[0]  # type: ignore
            best_type, best_score = None, -1.0
            for rel_type, proto in self._prototypes.items():  # type: ignore
                score = self._cosine(vec, proto)
                if score > best_score:
                    best_score = score
                    best_type = rel_type
            if best_score < SIMILARITY_THRESHOLD or best_type is None:
                return None
            return best_type, best_score
        except Exception as e:
            logger.warning(f"임베딩 분류 실패: {e}")
            return None


_embedder: Optional[RelationEmbedder] = None


def get_embedder() -> RelationEmbedder:
    global _embedder
    if _embedder is None:
        _embedder = RelationEmbedder()
    return _embedder
