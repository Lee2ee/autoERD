import { Entity, Relationship, Attribute, BusinessRule } from '../types'

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

export function generateDDL(
  entities: Entity[],
  relationships: Relationship[],
  businessRules: BusinessRule[] = [],
): string {
  if (entities.length === 0) return ''

  const enabled = businessRules.filter((r) => r.enabled)

  // 엔티티명 → tableName 매핑 헬퍼
  const tableOf = (entityName: string) =>
    entities.find((e) => e.name === entityName)?.tableName ?? entityName.toLowerCase()

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

  // FK 제약조건 (CASCADE 정책 반영)
  const fkLines: string[] = []
  for (const entity of entities) {
    for (const attr of entity.attributes) {
      if (attr.isForeign && attr.referencedEntityId) {
        const refEntity = entities.find((e) => e.id === attr.referencedEntityId)
        if (refEntity) {
          const refPk = refEntity.attributes.find((a) => a.isPrimary)
          if (refPk) {
            // CASCADE 업무 규칙 매칭: entity + column
            const cascadeRule = enabled.find(
              (r) =>
                r.ruleType === 'CASCADE' &&
                (r.entity === entity.name || tableOf(r.entity) === entity.tableName) &&
                (!r.column || r.column === attr.name || r.column === attr.columnName)
            )
            const onDelete = cascadeRule?.definition ?? 'NO ACTION'
            fkLines.push(
              `ALTER TABLE ${entity.tableName} ADD CONSTRAINT fk_${entity.tableName}_${attr.columnName} ` +
              `FOREIGN KEY (${attr.columnName}) REFERENCES ${refEntity.tableName}(${refPk.columnName}) ON DELETE ${onDelete};`
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
    lines.push('')
  }

  // ── 업무 규칙 기반 제약조건 ─────────────────────────────────

  const checkLines: string[] = []
  const uniqueLines: string[] = []
  const indexLines: string[] = []

  for (const rule of enabled) {
    const tableName = tableOf(rule.entity)
    const colName = rule.column ? rule.column.toLowerCase().replace(/\s+/g, '_') : null

    if (rule.ruleType === 'CHECK' && colName) {
      checkLines.push(
        `ALTER TABLE ${tableName} ADD CONSTRAINT chk_${tableName}_${colName} CHECK (${rule.definition});`
      )
    }

    if (rule.ruleType === 'ENUM' && colName) {
      const values = rule.definition
        .split(',')
        .map((v) => `'${v.trim()}'`)
        .join(', ')
      checkLines.push(
        `ALTER TABLE ${tableName} ADD CONSTRAINT chk_${tableName}_${colName}_enum CHECK (${colName} IN (${values}));`
      )
    }

    if (rule.ruleType === 'UNIQUE' && colName) {
      // 컬럼 레벨 UNIQUE는 이미 CREATE TABLE에 반영됐을 수 있으므로, 추가 보험용
      uniqueLines.push(
        `ALTER TABLE ${tableName} ADD CONSTRAINT uq_${tableName}_${colName} UNIQUE (${colName});`
      )
    }

    if (rule.ruleType === 'INDEX' && colName) {
      indexLines.push(
        `CREATE INDEX IF NOT EXISTS idx_${tableName}_${colName} ON ${tableName}(${colName});`
      )
    }
  }

  if (checkLines.length > 0) {
    lines.push('-- CHECK / ENUM Constraints')
    lines.push(...checkLines)
    lines.push('')
  }

  if (uniqueLines.length > 0) {
    lines.push('-- Unique Constraints')
    lines.push(...uniqueLines)
    lines.push('')
  }

  if (indexLines.length > 0) {
    lines.push('-- Indexes')
    lines.push(...indexLines)
    lines.push('')
  }

  return lines.join('\n')
}
