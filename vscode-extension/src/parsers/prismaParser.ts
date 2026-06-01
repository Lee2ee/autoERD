/**
 * VSCode 익스텐션용 Prisma schema 파서 (Node.js 환경)
 */
import { randomUUID } from 'crypto'
import type { ParsedEntity, ParsedRelationship, ParseResult } from './jpaParser'

const PRISMA_SCALARS = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes'])

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function prismaTypeToDataType(prismaType: string): string {
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
  const entities: ParsedEntity[] = []
  const pendingRels: Array<{ sourceId: string; targetName: string; type: string }> = []
  const warnings: string[] = []

  const modelPattern = /model\s+(\w+)\s*\{([^}]+)\}/g
  let match

  while ((match = modelPattern.exec(code)) !== null) {
    const modelName = match[1]
    const modelBody = match[2]

    const entity: ParsedEntity = {
      id: randomUUID(),
      name: modelName,
      tableName: toSnakeCase(modelName) + 's',
      description: `${modelName} 모델`,
      attributes: [],
      position: { x: 0, y: 0 },
    }

    const mapMatch = /@@map\s*\(\s*"([^"]+)"\s*\)/.exec(modelBody)
    if (mapMatch) entity.tableName = mapMatch[1]

    for (const line of modelBody.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('//') || t.startsWith('@@')) continue

      const fieldMatch = /^(\w+)\s+([\w[\]?]+)(.*)?$/.exec(t)
      if (!fieldMatch) continue

      const [, fieldName, fieldType, modifiers = ''] = fieldMatch
      const isOptional = fieldType.endsWith('?')
      const isArray = fieldType.endsWith('[]')
      const baseType = fieldType.replace(/[?[\]]/g, '')

      if (!PRISMA_SCALARS.has(baseType) && /^[A-Z]/.test(baseType)) {
        pendingRels.push({ sourceId: entity.id, targetName: baseType, type: isArray ? 'ONE_TO_MANY' : 'MANY_TO_ONE' })
        continue
      }
      if (!PRISMA_SCALARS.has(baseType)) continue

      const isPrimary = modifiers.includes('@id')
      const isUnique = modifiers.includes('@unique') && !isPrimary
      const isNullable = isOptional && !isPrimary
      const colMapMatch = /@map\s*\(\s*"([^"]+)"\s*\)/.exec(modifiers)
      const columnName = colMapMatch ? colMapMatch[1] : toSnakeCase(fieldName)
      const defaultMatch = /@default\s*\(([^)]+)\)/.exec(modifiers)
      let defaultValue: string | undefined
      if (defaultMatch) {
        const dv = defaultMatch[1].trim()
        if (dv === 'now()') defaultValue = 'NOW()'
        else if (dv !== 'autoincrement()' && dv !== 'cuid()' && dv !== 'uuid()') {
          defaultValue = dv.replace(/^"|"$/g, '')
        }
      }

      entity.attributes.push({
        id: randomUUID(),
        name: fieldName,
        columnName,
        type: prismaTypeToDataType(fieldType),
        isPrimary,
        isForeign: false,
        isNullable,
        isUnique,
        ...(defaultValue ? {} : {}),  // defaultValue는 ParsedAttribute에 포함되지 않음 (기본 구조 유지)
      })
    }

    if (entity.attributes.length > 0 && !entity.attributes.some((a) => a.isPrimary)) {
      entity.attributes[0].isPrimary = true
      warnings.push(`[${modelName}] @id 필드가 없어 첫 번째 필드를 PK로 지정했습니다.`)
    }

    entities.push(entity)
  }

  if (entities.length === 0) {
    warnings.push('model 블록을 찾을 수 없습니다.')
  }

  const nameToId: Record<string, string> = {}
  for (const e of entities) nameToId[e.name] = e.id

  const relationships: ParsedRelationship[] = []
  const seen = new Set<string>()
  for (const rel of pendingRels) {
    const targetId = nameToId[rel.targetName]
    if (targetId) {
      const key = [rel.sourceId, targetId].sort().join(':')
      if (!seen.has(key)) {
        seen.add(key)
        relationships.push({ id: randomUUID(), sourceEntityId: rel.sourceId, targetEntityId: targetId, type: rel.type })
      }
    } else {
      warnings.push(`관계 대상 '${rel.targetName}'을(를) 찾을 수 없습니다.`)
    }
  }

  return { entities, relationships, warnings }
}
