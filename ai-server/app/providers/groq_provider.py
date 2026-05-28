"""
Groq API 기반 provider.
규칙 기반 처리 후 AI 보조에만 사용.
"""
import json
import logging
from groq import AsyncGroq
from app.providers.base_provider import BaseProvider
from app.models.schemas import EntityCandidate, RelationshipCandidate

logger = logging.getLogger(__name__)


class GroqProvider(BaseProvider):

    def __init__(self, api_key: str, model: str = "llama-3.3-70b-versatile"):
        self.client = AsyncGroq(api_key=api_key)
        self.model = model

    async def _chat(self, system: str, user: str) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
            max_tokens=1024,
        )
        return response.choices[0].message.content or ""

    async def extract_entities(self, text: str, candidates: list[str]) -> list[EntityCandidate]:
        if not candidates:
            return []

        system = (
            "You are a database modeling assistant. "
            "Given a list of entity candidates extracted from Korean text, "
            "return enriched entity info as JSON. "
            "Output ONLY valid JSON, no explanation."
        )
        user = (
            f"Text: {text}\n"
            f"Candidates: {candidates}\n\n"
            "Return JSON array:\n"
            '[{"name": "...", "description": "...", "attributes": ["attr1", "attr2"]}]'
        )

        try:
            raw = await self._chat(system, user)
            # JSON 파싱
            start = raw.find("[")
            end = raw.rfind("]") + 1
            if start == -1 or end == 0:
                raise ValueError("No JSON array found")
            data = json.loads(raw[start:end])
            return [EntityCandidate(**item) for item in data if "name" in item]
        except Exception as e:
            logger.warning(f"Groq entity extraction failed: {e}")
            # fallback: 후보 그대로 반환
            return [EntityCandidate(name=c) for c in candidates]

    async def suggest_attributes(self, entity_name: str, context: str) -> list[str]:
        system = "You are a database schema expert. Return only a JSON array of attribute name strings in Korean."
        user = f"Entity: {entity_name}\nContext: {context}\nSuggest 5-7 typical attributes."

        try:
            raw = await self._chat(system, user)
            start = raw.find("[")
            end = raw.rfind("]") + 1
            return json.loads(raw[start:end]) if start != -1 else []
        except Exception as e:
            logger.warning(f"Groq attribute suggestion failed: {e}")
            return []

    async def infer_relationships(
        self, entities: list[str], text: str
    ) -> list[RelationshipCandidate]:
        if len(entities) < 2:
            return []

        system = (
            "You are a database modeling expert. "
            "Infer relationships between entities from Korean text. "
            "Return ONLY valid JSON array, no explanation."
        )
        user = (
            f"Text: {text}\n"
            f"Entities: {entities}\n\n"
            "Return JSON array:\n"
            '[{"source": "EntityA", "target": "EntityB", "type": "ONE_TO_MANY"}]\n'
            "Types: ONE_TO_ONE, ONE_TO_MANY, MANY_TO_ONE, MANY_TO_MANY"
        )

        try:
            raw = await self._chat(system, user)
            start = raw.find("[")
            end = raw.rfind("]") + 1
            if start == -1:
                return []
            data = json.loads(raw[start:end])
            return [RelationshipCandidate(**item) for item in data if "source" in item and "target" in item]
        except Exception as e:
            logger.warning(f"Groq relationship inference failed: {e}")
            return []

    async def generate_description(self, entity_name: str, context: str) -> str:
        system = "Return only a single short description sentence in Korean for the given entity."
        user = f"Entity: {entity_name}\nContext: {context}"
        try:
            return (await self._chat(system, user)).strip()
        except Exception:
            return f"{entity_name} 정보"
