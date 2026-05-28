import { Entity, Relationship, Attribute } from '../types'

function columnTypeToDDL(attr: Attribute): string {
  switch (attr.type) {
    case 'VARCHAR':
      return `VARCHAR(${attr.length ?? 255})`
    case 'TEXT':
      return 'TEXT'
    case 'INTEGER':
      return 'INTEGER'
    case 'BIGINT':
      return 'BIGINT'
    case 'DECIMAL':
      return 'DECIMAL(10, 2)'
    case 'BOOLEAN':
      return 'BOOLEAN'
    case 'TIMESTAMP':
      return 'TIMESTAMP'
    case 'DATE':
      return 'DATE'
    case 'UUID':
      return 'UUID'
    case 'FLOAT':
      return 'FLOAT'
    case 'JSON':
      return 'JSONB'
    default:
      return 'VARCHAR(255)'
  }
}

export function generateDDL(entities: Entity[], relationships: Relationship[]): string {
  if (entities.length === 0) return ''

  const lines: string[] = []
  lines.push('-- Auto-generated PostgreSQL DDL')
  lines.push(`-- Generated at: ${new Date().toISOString()}`)
  lines.push('')

  for (const entity of entities) {
    lines.push(`CREATE TABLE IF NOT EXISTS ${entity.tableName} (`)

    const columnLines: string[] = []

    for (const attr of entity.attributes) {
      let col = `  ${attr.columnName} ${columnTypeToDDL(attr)}`

      if (!attr.isNullable || attr.isPrimary) col += ' NOT NULL'
      if (attr.isPrimary) col += ' PRIMARY KEY'
      if (attr.isUnique && !attr.isPrimary) col += ' UNIQUE'
      if (attr.defaultValue) col += ` DEFAULT ${attr.defaultValue}`
      if (attr.isPrimary && (attr.type === 'BIGINT' || attr.type === 'INTEGER')) {
        col = `  ${attr.columnName} ${columnTypeToDDL(attr)} GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
      }

      columnLines.push(col)
    }

    lines.push(columnLines.join(',\n'))
    lines.push(');')
    lines.push('')
  }

  // FK 제약조건
  const fkLines: string[] = []
  for (const entity of entities) {
    for (const attr of entity.attributes) {
      if (attr.isForeign && attr.referencedEntityId) {
        const refEntity = entities.find((e) => e.id === attr.referencedEntityId)
        if (refEntity) {
          const refPk = refEntity.attributes.find((a) => a.isPrimary)
          if (refPk) {
            fkLines.push(
              `ALTER TABLE ${entity.tableName} ADD CONSTRAINT fk_${entity.tableName}_${attr.columnName} ` +
              `FOREIGN KEY (${attr.columnName}) REFERENCES ${refEntity.tableName}(${refPk.columnName});`
            )
          }
        }
      }
    }
  }

  // N:M 중간 테이블
  for (const rel of relationships) {
    if (rel.type === 'MANY_TO_MANY') {
      const src = entities.find((e) => e.id === rel.sourceEntityId)
      const tgt = entities.find((e) => e.id === rel.targetEntityId)
      if (src && tgt) {
        const srcPk = src.attributes.find((a) => a.isPrimary)
        const tgtPk = tgt.attributes.find((a) => a.isPrimary)
        if (srcPk && tgtPk) {
          const tableName = `${src.tableName}_${tgt.tableName}`
          lines.push(`CREATE TABLE IF NOT EXISTS ${tableName} (`)
          lines.push(`  ${src.tableName}_id BIGINT NOT NULL,`)
          lines.push(`  ${tgt.tableName}_id BIGINT NOT NULL,`)
          lines.push(`  PRIMARY KEY (${src.tableName}_id, ${tgt.tableName}_id),`)
          lines.push(`  FOREIGN KEY (${src.tableName}_id) REFERENCES ${src.tableName}(${srcPk.columnName}),`)
          lines.push(`  FOREIGN KEY (${tgt.tableName}_id) REFERENCES ${tgt.tableName}(${tgtPk.columnName})`)
          lines.push(');')
          lines.push('')
        }
      }
    }
  }

  if (fkLines.length > 0) {
    lines.push('-- Foreign Key Constraints')
    lines.push(...fkLines)
  }

  return lines.join('\n')
}
