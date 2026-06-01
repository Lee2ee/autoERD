/**
 * 코드에서 엔티티 파싱 유틸리티
 * JPA (@Entity) 및 Prisma schema 파싱 지원
 */
import { v4 as uuidv4 } from 'uuid'
import { Entity, Attribute, DataType, Relationship, RelationType } from '../types'
import { toSnakeCase } from './naming'

export interface ParseResult {
  entities: Entity[]
  relationships: Relationship[]
  warnings: string[]
}

// ── JPA @Entity 파서 ──────────────────────────────────────────────────────────

function javaTypeToDataType(javaType: string): DataType {
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

/** 브레이스 쌍 추적으로 @Entity 클래스 블록 추출 */
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

interface RawField {
  annotations: string[]
  javaType: string
  fieldName: string
}

/** 클래스 바디에서 필드 목록 추출 */
function extractFields(classBody: string): RawField[] {
  const fields: RawField[] = []
  const lines = classBody.split('\n')
  let pending: string[] = []

  for (const line of lines) {
    const t = line.trim()
    if (!t) { pending = []; continue }

    if (t.startsWith('@')) {
      pending.push(t)
      continue
    }

    // 필드: visibility? type fieldName [;=]
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
  const entities: Entity[] = []
  const pendingRels: Array<{ sourceId: string; targetName: string; type: RelationType }> = []
  const warnings: string[] = []

  const blocks = extractClassBlocks(code)
  if (blocks.length === 0) {
    warnings.push('@Entity 어노테이션을 찾을 수 없습니다. Java 파일에 @Entity 클래스가 있는지 확인하세요.')
    return { entities, relationships: [], warnings }
  }

  for (const block of blocks) {
    const classMatch = /class\s+(\w+)/.exec(block)
    if (!classMatch) continue
    const className = classMatch[1]

    const tableMatch = /@Table\s*\([^)]*name\s*=\s*"([^"]+)"/.exec(block)
    const tableName = tableMatch ? tableMatch[1] : toSnakeCase(className).replace(/^_/, '') + 's'

    const entity: Entity = {
      id: uuidv4(),
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
      const isCollection = /^(List|Set|Collection|Queue|Deque)</.test(field.javaType)

      // 연관관계 처리
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
      const columnName = colNameMatch ? colNameMatch[1] : toSnakeCase(field.fieldName).replace(/^_/, '')

      const lengthMatch = /length\s*=\s*(\d+)/.exec(ann)
      const length = lengthMatch ? parseInt(lengthMatch[1]) : undefined

      const attr: Attribute = {
        id: uuidv4(),
        name: field.fieldName,
        columnName,
        type: javaTypeToDataType(field.javaType),
        length,
        isPrimary,
        isForeign: false,
        isNullable,
        isUnique,
      }
      entity.attributes.push(attr)
    }

    if (entity.attributes.length > 0 && !entity.attributes.some((a) => a.isPrimary)) {
      entity.attributes[0].isPrimary = true
      warnings.push(`[${className}] @Id 필드가 없어 첫 번째 필드를 PK로 지정했습니다.`)
    }

    entities.push(entity)
  }

  // 관계 해석
  const nameToEntity: Record<string, Entity> = {}
  for (const e of entities) nameToEntity[e.name] = e

  const relationships: Relationship[] = []
  for (const rel of pendingRels) {
    const target = nameToEntity[rel.targetName]
    if (target) {
      relationships.push({ id: uuidv4(), sourceEntityId: rel.sourceId, targetEntityId: target.id, type: rel.type })
    } else {
      warnings.push(`관계 대상 엔티티 '${rel.targetName}'을(를) 찾을 수 없습니다. 해당 파일도 포함해 주세요.`)
    }
  }

  return { entities, relationships, warnings }
}

// ── Prisma Schema 파서 ────────────────────────────────────────────────────────

const PRISMA_SCALARS = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes'])

function prismaTypeToDataType(prismaType: string): DataType {
  const t = prismaType.replace(/[?[\]]/g, '').trim()
  if (t === 'String') return 'VARCHAR'
  if (t === 'Int') return 'INTEGER'
  if (t === 'BigInt') return 'BIGINT'
  if (t === 'Float') return 'FLOAT'
  if (t === 'Decimal') return 'DECIMAL'
  if (t === 'Boolean') return 'BOOLEAN'
  if (t === 'DateTime') return 'TIMESTAMP'
  if (t === 'Json') return 'JSON'
  return 'VARCHAR'
}

export function parsePrismaSchema(code: string): ParseResult {
  const entities: Entity[] = []
  const pendingRels: Array<{ sourceId: string; targetName: string; type: RelationType }> = []
  const warnings: string[] = []

  const modelPattern = /model\s+(\w+)\s*\{([^}]+)\}/g
  let match

  while ((match = modelPattern.exec(code)) !== null) {
    const modelName = match[1]
    const modelBody = match[2]

    const entity: Entity = {
      id: uuidv4(),
      name: modelName,
      tableName: toSnakeCase(modelName).replace(/^_/, '') + 's',
      description: `${modelName} 모델`,
      attributes: [],
      position: { x: 0, y: 0 },
    }

    // @@map("table_name") 처리
    const mapMatch = /@@map\s*\(\s*"([^"]+)"\s*\)/.exec(modelBody)
    if (mapMatch) entity.tableName = mapMatch[1]

    for (const line of modelBody.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue

      // field fieldType modifiers...
      const fieldMatch = /^(\w+)\s+([\w[\]?]+)(.*)?$/.exec(trimmed)
      if (!fieldMatch) continue

      const [, fieldName, fieldType, modifiers = ''] = fieldMatch
      const isOptional = fieldType.endsWith('?')
      const isArray = fieldType.endsWith('[]')
      const baseType = fieldType.replace(/[?[\]]/g, '')

      // 관계 필드 (대문자 시작 + Prisma 스칼라 아님)
      if (!PRISMA_SCALARS.has(baseType) && /^[A-Z]/.test(baseType)) {
        if (isArray) {
          pendingRels.push({ sourceId: entity.id, targetName: baseType, type: 'ONE_TO_MANY' })
        } else {
          pendingRels.push({ sourceId: entity.id, targetName: baseType, type: 'MANY_TO_ONE' })
        }
        continue
      }

      if (!PRISMA_SCALARS.has(baseType)) continue

      const isPrimary = modifiers.includes('@id')
      const isUnique = modifiers.includes('@unique') && !isPrimary
      const isNullable = isOptional && !isPrimary

      // @map("col_name") 처리
      const colMapMatch = /@map\s*\(\s*"([^"]+)"\s*\)/.exec(modifiers)
      const columnName = colMapMatch ? colMapMatch[1] : toSnakeCase(fieldName).replace(/^_/, '')

      // @default(...) 처리
      const defaultMatch = /@default\s*\(([^)]+)\)/.exec(modifiers)
      let defaultValue: string | undefined
      if (defaultMatch) {
        const dv = defaultMatch[1].trim()
        if (dv === 'now()') defaultValue = 'NOW()'
        else if (dv === 'autoincrement()') defaultValue = undefined
        else if (dv === 'cuid()' || dv === 'uuid()') defaultValue = undefined
        else defaultValue = dv.replace(/^"|"$/g, '')
      }

      entity.attributes.push({
        id: uuidv4(),
        name: fieldName,
        columnName,
        type: prismaTypeToDataType(fieldType),
        isPrimary,
        isForeign: false,
        isNullable,
        isUnique,
        defaultValue,
      })
    }

    if (entity.attributes.length > 0 && !entity.attributes.some((a) => a.isPrimary)) {
      entity.attributes[0].isPrimary = true
      warnings.push(`[${modelName}] @id 필드가 없어 첫 번째 필드를 PK로 지정했습니다.`)
    }

    entities.push(entity)
  }

  if (entities.length === 0) {
    warnings.push('model 블록을 찾을 수 없습니다. Prisma schema 파일(.prisma)을 확인하세요.')
  }

  // 관계 해석 (양방향 중복 제거)
  const nameToEntity: Record<string, Entity> = {}
  for (const e of entities) nameToEntity[e.name] = e

  const relationships: Relationship[] = []
  const seen = new Set<string>()

  for (const rel of pendingRels) {
    const target = nameToEntity[rel.targetName]
    if (target) {
      const key = [rel.sourceId, target.id].sort().join(':')
      if (!seen.has(key)) {
        seen.add(key)
        relationships.push({ id: uuidv4(), sourceEntityId: rel.sourceId, targetEntityId: target.id, type: rel.type })
      }
    } else {
      warnings.push(`관계 대상 모델 '${rel.targetName}'을(를) 찾을 수 없습니다.`)
    }
  }

  return { entities, relationships, warnings }
}
