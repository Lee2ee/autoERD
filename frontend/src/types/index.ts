export type DataType =
  | 'VARCHAR'
  | 'TEXT'
  | 'INTEGER'
  | 'BIGINT'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'TIMESTAMP'
  | 'DATE'
  | 'UUID'
  | 'FLOAT'
  | 'JSON'

export type RelationType = 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY'

export type BusinessRuleType =
  | 'CHECK'
  | 'UNIQUE'
  | 'INDEX'
  | 'CASCADE'
  | 'DEFAULT'
  | 'ENUM'
  | 'NULLABLE'
  | 'AUDIT'

export interface BusinessRule {
  id: string
  entity: string
  column?: string
  ruleType: BusinessRuleType
  definition: string
  description: string
  enabled: boolean
}

export interface Attribute {
  id: string
  name: string
  columnName: string
  type: DataType
  length?: number
  isPrimary: boolean
  isForeign: boolean
  isNullable: boolean
  isUnique: boolean
  defaultValue?: string
  referencedEntityId?: string
  referencedColumnId?: string
}

export interface Entity {
  id: string
  name: string
  tableName: string
  description: string
  attributes: Attribute[]
  position: { x: number; y: number }
}

export interface Relationship {
  id: string
  sourceEntityId: string
  targetEntityId: string
  type: RelationType
  sourceLabel?: string
  targetLabel?: string
  onDelete?: 'CASCADE' | 'RESTRICT' | 'SET_NULL' | 'NO_ACTION'
}

export interface Project {
  id: string
  name: string
  description?: string
  entities: Entity[]
  relationships: Relationship[]
  requirement?: string
  businessRules?: BusinessRule[]
  createdAt: string
  updatedAt: string
}

export interface RateLimitInfo {
  limit_requests?: number
  remaining_requests?: number
  limit_tokens?: number
  remaining_tokens?: number
  reset_requests?: string
  reset_tokens?: string
}

export type NormalFormLevel = '1NF' | '2NF' | '3NF' | 'BCNF'

// 정규화 결과
export interface NormalizeResult {
  entities: Array<{
    name: string
    description: string
    attributes: string[]
  }>
  relationships: Array<{
    source: string
    target: string
    type: RelationType
  }>
  changes: string[]
  rate_limit?: RateLimitInfo
}

// AI 분석 결과
export interface AnalysisResult {
  entities: Array<{
    name: string
    description: string
    attributes: string[]
  }>
  relationships: Array<{
    source: string
    target: string
    type: RelationType
  }>
  recommendations: string[]
  business_rules: Array<{
    entity: string
    column?: string
    rule_type: BusinessRuleType
    definition: string
    description: string
  }>
  rate_limit?: RateLimitInfo
}
