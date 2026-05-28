from pydantic import BaseModel, Field
from typing import Literal, Optional

RelationType = Literal["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_ONE", "MANY_TO_MANY"]


class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)


class EntityCandidate(BaseModel):
    name: str
    description: str = ""
    attributes: list[str] = Field(default_factory=list)


class RelationshipCandidate(BaseModel):
    source: str
    target: str
    type: RelationType = "ONE_TO_MANY"


class AnalyzeResponse(BaseModel):
    entities: list[EntityCandidate] = Field(default_factory=list)
    relationships: list[RelationshipCandidate] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
