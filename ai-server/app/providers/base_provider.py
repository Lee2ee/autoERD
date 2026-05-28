from abc import ABC, abstractmethod
from app.models.schemas import EntityCandidate, RelationshipCandidate


class BaseProvider(ABC):
    """AI provider 추상 인터페이스. 규칙 기반 처리 후 AI 보조에만 사용."""

    @abstractmethod
    async def extract_entities(self, text: str, candidates: list[str]) -> list[EntityCandidate]:
        """규칙 기반으로 추출된 후보를 AI로 보정."""
        ...

    @abstractmethod
    async def suggest_attributes(self, entity_name: str, context: str) -> list[str]:
        """엔티티에 적합한 속성 추천."""
        ...

    @abstractmethod
    async def infer_relationships(
        self, entities: list[str], text: str
    ) -> list[RelationshipCandidate]:
        """엔티티 간 관계 추론 보조."""
        ...

    @abstractmethod
    async def generate_description(self, entity_name: str, context: str) -> str:
        """엔티티 설명 생성."""
        ...
