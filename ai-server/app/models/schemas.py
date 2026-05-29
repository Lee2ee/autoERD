from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Literal, Optional

RelationType = Literal["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_ONE", "MANY_TO_MANY"]
RuleType = Literal["CHECK", "UNIQUE", "INDEX", "CASCADE", "DEFAULT", "ENUM", "NULLABLE", "AUDIT"]
NormalFormLevel = Literal["1NF", "2NF", "3NF", "BCNF"]


class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=20000)


class EntityInput(BaseModel):
    name: str
    attributes: list[str]


class NormalizeRequest(BaseModel):
    entities: list[EntityInput] = Field(..., min_length=1)
    level: NormalFormLevel


class NormalizeResponse(BaseModel):
    entities: list[EntityCandidate] = Field(default_factory=list)
    relationships: list[RelationshipCandidate] = Field(default_factory=list)
    changes: list[str] = Field(default_factory=list)
    rate_limit: RateLimitInfo | None = None


class EntityCandidate(BaseModel):
    name: str
    description: str = ""
    attributes: list[str] = Field(default_factory=list)


class RelationshipCandidate(BaseModel):
    source: str
    target: str
    type: RelationType = "ONE_TO_MANY"


class BusinessRule(BaseModel):
    entity: str
    column: str | None = None
    rule_type: RuleType
    definition: str   # e.g. "amount > 0", "CASCADE", "PENDING,ACTIVE,DONE"
    description: str  # 사람이 읽기 좋은 한국어 설명


class RateLimitInfo(BaseModel):
    limit_requests: int | None = None
    remaining_requests: int | None = None
    limit_tokens: int | None = None
    remaining_tokens: int | None = None
    reset_requests: str | None = None  # e.g. "1m0s"
    reset_tokens: str | None = None    # e.g. "6s"


class AnalyzeResponse(BaseModel):
    entities: list[EntityCandidate] = Field(default_factory=list)
    relationships: list[RelationshipCandidate] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    business_rules: list[BusinessRule] = Field(default_factory=list)
    rate_limit: RateLimitInfo | None = None
