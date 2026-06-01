/**
 * VSCode 익스텐션용 JPA @Entity 파서 (Node.js 환경)
 * frontend/src/utils/codeParser.ts 와 동일한 로직, crypto.randomUUID() 사용
 */
import { randomUUID } from 'crypto'

export interface ParsedAttribute {
  id: string
  name: string
  columnName: string
  type: string
  length?: number
  isPrimary: boolean
  isForeign: boolean
  isNullable: boolean
  isUnique: boolean
}

export interface ParsedEntity {
  id: string
  name: string
  tableName: string
  description: string
  attributes: ParsedAttribute[]
  position: { x: number; y: number }
}

export interface ParsedRelationship {
  id: string
  sourceEntityId: string
  targetEntityId: string
  type: string
}

export interface ParseResult {
  entities: ParsedEntity[]
  relationships: ParsedRelationship[]
  warnings: string[]
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function javaTypeToDataType(javaType: string): string {
  const t = javaType.split('<')[0].trim().toLowerCase()
  if (t === 'string') return 'VARCHAR'
  if (t === 'long' || t === 'biginteger') return 'BIGINT'
  if (t === 'integer' || t === 'int') return 'INTEGER'
  if (t === 'double' || t === 'float') return 'FLOAT'
  if (t === 'bigdecimal') return 'DECIMAL'
  if (t === 'boolean') return 'BOOLEAN'
  if (t === 'localdatetime' || t === 'timestamp' || t === 'instant' || t === 'zoneddatetime') return 'TIMESTAMP'
  if (t === 'localdate' || t === 'date') return 'DATE'
  if (t === 'uuid') return 'UUID'
  if (t === 'map' || t === 'jsonnode') return 'JSON'
  return 'VARCHAR'
}

function extractClassBlocks(code: string): string[] {
  const blocks: string[] = []
  let i = 0
  while (i < code.length) {
    const entityIdx = code.indexOf('@Entity', i)
    if (entityIdx === -1) break
    const classIdx = code.indexOf('class ', entityIdx)
    if (classIdx === -1) break
    const openBrace = code.indexOf('{', classIdx)
    if (openBrace === -1) break
    let depth = 1
    let j = openBrace + 1
    while (j < code.length && depth > 0) {
      if (code[j] === '{') depth++
      else if (code[j] === '}') depth--
      j++
    }
    blocks.push(code.slice(entityIdx, j))
    i = j
  }
  return blocks
}

interface RawField { annotations: string[]; javaType: string; fieldName: string }

function extractFields(classBody: string): RawField[] {
  const fields: RawField[] = []
  const lines = classBody.split('\n')
  let pending: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) { pending = []; continue }
    if (t.startsWith('@')) { pending.push(t); continue }
    const m = /^(?:(?:private|protected|public|static|final|transient)\s+)*([A-Z][\w<>,\s]*|(?:int|long|double|float|boolean|byte|char|short))\s+(\w+)\s*[;=]/.exec(t)
    if (m) {
      fields.push({ annotations: [...pending], javaType: m[1].trim(), fieldName: m[2] })
      pending = []
    } else if (!t.startsWith('//') && !t.startsWith('*') && t !== '{' && t !== '}') {
      pending = []
    }
  }
  return fields
}

export function parseJpaEntities(code: string): ParseResult {
  const entities: ParsedEntity[] = []
  const pendingRels: Array<{ sourceId: string; targetName: string; type: string }> = []
  const warnings: string[] = []

  const blocks = extractClassBlocks(code)
  if (blocks.length === 0) {
    warnings.push('@Entity 어노테이션을 찾을 수 없습니다.')
    return { entities, relationships: [], warnings }
  }

  for (const block of blocks) {
    const classMatch = /class\s+(\w+)/.exec(block)
    if (!classMatch) continue
    const className = classMatch[1]

    const tableMatch = /@Table\s*\([^)]*name\s*=\s*"([^"]+)"/.exec(block)
    const tableName = tableMatch ? tableMatch[1] : toSnakeCase(className) + 's'

    const entity: ParsedEntity = {
      id: randomUUID(),
      name: className,
      tableName,
      description: `${className} 엔티티`,
      attributes: [],
      position: { x: 0, y: 0 },
    }

    for (const field of extractFields(block)) {
      if (field.fieldName === 'serialVersionUID') continue
      const ann = field.annotations.join('\n')
      const baseType = field.javaType.split('<')[0].trim()
      const isCollection = /^(List|Set|Collection|Queue)</.test(field.javaType)

      if (ann.includes('@OneToMany') || (ann.includes('@ManyToMany') && isCollection)) {
        const typeArg = /<(\w+)>/.exec(field.javaType)
        if (typeArg) pendingRels.push({ sourceId: entity.id, targetName: typeArg[1], type: ann.includes('@OneToMany') ? 'ONE_TO_MANY' : 'MANY_TO_MANY' })
        continue
      }
      if (ann.includes('@ManyToOne') && !isCollection) {
        pendingRels.push({ sourceId: entity.id, targetName: baseType, type: 'MANY_TO_ONE' })
        continue
      }
      if (ann.includes('@OneToOne') && !isCollection) {
        pendingRels.push({ sourceId: entity.id, targetName: baseType, type: 'ONE_TO_ONE' })
        continue
      }
      if (isCollection) continue

      const isPrimary = ann.includes('@Id')
      const isUnique = /unique\s*=\s*true/.test(ann)
      const isNullable = !/nullable\s*=\s*false/.test(ann) && !isPrimary
      const colNameMatch = /name\s*=\s*"([^"]+)"/.exec(ann)
      const columnName = colNameMatch ? colNameMatch[1] : toSnakeCase(field.fieldName)
      const lengthMatch = /length\s*=\s*(\d+)/.exec(ann)

      entity.attributes.push({
        id: randomUUID(),
        name: field.fieldName,
        columnName,
        type: javaTypeToDataType(field.javaType),
        length: lengthMatch ? parseInt(lengthMatch[1]) : undefined,
        isPrimary,
        isForeign: false,
        isNullable,
        isUnique,
      })
    }

    if (entity.attributes.length > 0 && !entity.attributes.some((a) => a.isPrimary)) {
      entity.attributes[0].isPrimary = true
      warnings.push(`[${className}] @Id 필드가 없어 첫 번째 필드를 PK로 지정했습니다.`)
    }

    entities.push(entity)
  }

  const nameToId: Record<string, string> = {}
  for (const e of entities) nameToId[e.name] = e.id

  const relationships: ParsedRelationship[] = []
  for (const rel of pendingRels) {
    const targetId = nameToId[rel.targetName]
    if (targetId) {
      relationships.push({ id: randomUUID(), sourceEntityId: rel.sourceId, targetEntityId: targetId, type: rel.type })
    } else {
      warnings.push(`관계 대상 '${rel.targetName}'을(를) 찾을 수 없습니다.`)
    }
  }

  return { entities, relationships, warnings }
}
