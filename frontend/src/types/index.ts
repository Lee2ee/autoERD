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
}

export interface Project {
  id: string
  name: string
  description?: string
  entities: Entity[]
  relationships: Relationship[]
  requirement?: string
  createdAt: string
  updatedAt: string
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
}
