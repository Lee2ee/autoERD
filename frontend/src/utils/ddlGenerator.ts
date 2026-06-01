import { Entity, Relationship, Attribute, BusinessRule } from '../types'

// ── 공통 타입 헬퍼 ────────────────────────────────────────────────────────────

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
      let col: string
      // BIGINT/INTEGER PK → GENERATED ALWAYS AS IDENTITY (NOT NULL PRIMARY KEY 포함)
      if (attr.isPrimary && (attr.type === 'BIGINT' || attr.type === 'INTEGER')) {
        col = `  ${attr.columnName} ${columnTypeToDDL(attr)} GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
      } else {
        col = `  ${attr.columnName} ${columnTypeToDDL(attr)}`
        if (!attr.isNullable || attr.isPrimary) col += ' NOT NULL'
        if (attr.isPrimary) col += ' PRIMARY KEY'
        if (attr.isUnique && !attr.isPrimary) col += ' UNIQUE'
        if (attr.defaultValue) col += ` DEFAULT ${attr.defaultValue}`
      }
      columnLines.push(col)
    }

    lines.push(columnLines.join(',\n'))
    lines.push(');')
    lines.push('')
  }

  // FK 제약조건 (CASCADE 정책 반영)
  const fkLines: string[] = []
  const fkSeen = new Set<string>() // 중복 FK 제약조건 방지
  for (const entity of entities) {
    for (const attr of entity.attributes) {
      if (attr.isForeign && attr.referencedEntityId) {
        const refEntity = entities.find((e) => e.id === attr.referencedEntityId)
        if (refEntity) {
          const refPk = refEntity.attributes.find((a) => a.isPrimary)
          if (refPk) {
            const constraintName = `fk_${entity.tableName}_${attr.columnName}`
            if (fkSeen.has(constraintName)) continue
            fkSeen.add(constraintName)

            // CASCADE 업무 규칙 매칭: entity + column (snake_case 정규화 후 비교)
            const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '_')
            const cascadeRule = enabled.find(
              (r) =>
                r.ruleType === 'CASCADE' &&
                (r.entity === entity.name || tableOf(r.entity) === entity.tableName) &&
                (!r.column ||
                  normalize(r.column) === normalize(attr.name) ||
                  normalize(r.column) === normalize(attr.columnName))
            )
            const onDelete = cascadeRule?.definition ?? 'NO ACTION'
            fkLines.push(
              `ALTER TABLE ${entity.tableName} ADD CONSTRAINT ${constraintName} ` +
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
        .map((v) => `'${v.trim().replace(/'/g, "''")}'`) // SQL 문자열 내 따옴표 escape
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

// ── Flyway 포맷 ───────────────────────────────────────────────────────────────

/**
 * Flyway 마이그레이션 SQL 생성.
 * 내용은 표준 DDL과 동일하며, 다운로드 파일명을 V{version}__{desc}.sql 로 지정해야 합니다.
 */
export function generateFlywayDDL(
  entities: Entity[],
  relationships: Relationship[],
  businessRules: BusinessRule[] = [],
  version = '1',
): string {
  const sql = generateDDL(entities, relationships, businessRules)
  if (!sql) return ''
  return sql
    .replace('-- Auto-generated PostgreSQL DDL', `-- Flyway Migration: V${version}__create_schema.sql`)
    .replace(/^-- Generated at:.*$/m, `-- Flyway version: ${version} | autoincrement via GENERATED ALWAYS AS IDENTITY`)
}

// ── Liquibase XML 포맷 ────────────────────────────────────────────────────────

export function generateLiquibaseDDL(
  entities: Entity[],
  relationships: Relationship[],
  businessRules: BusinessRule[] = [],
): string {
  if (entities.length === 0) return ''

  const enabled = businessRules.filter((r) => r.enabled)
  const tableOf = (entityName: string) =>
    entities.find((e) => e.name === entityName)?.tableName ?? entityName.toLowerCase()

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<databaseChangeLog')
  lines.push('  xmlns="http://www.liquibase.org/xml/ns/dbchangelog"')
  lines.push('  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"')
  lines.push('  xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog')
  lines.push('    http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-4.0.xsd">')
  lines.push('')

  let csId = 1

  // CREATE TABLE changeset per entity
  for (const entity of entities) {
    lines.push(`  <!-- ${entity.name} -->`)
    lines.push(`  <changeSet id="${csId++}" author="autoerd">`)
    lines.push(`    <createTable tableName="${entity.tableName}">`)

    for (const attr of entity.attributes) {
      const type = columnTypeToDDL(attr)
      const isAutoInc = attr.isPrimary && (attr.type === 'BIGINT' || attr.type === 'INTEGER')
      const constraintParts: string[] = []
      if (attr.isPrimary) constraintParts.push('primaryKey="true"')
      if (!attr.isNullable || attr.isPrimary) constraintParts.push('nullable="false"')
      if (attr.isUnique && !attr.isPrimary) constraintParts.push('unique="true"')

      const attrs = [
        `name="${attr.columnName}"`,
        `type="${type}"`,
        isAutoInc ? 'autoIncrement="true"' : null,
        attr.defaultValue && !isAutoInc ? `defaultValue="${attr.defaultValue}"` : null,
      ]
        .filter(Boolean)
        .join(' ')

      lines.push(`      <column ${attrs}>`)
      if (constraintParts.length > 0) {
        lines.push(`        <constraints ${constraintParts.join(' ')}/>`)
      }
      lines.push(`      </column>`)
    }

    lines.push(`    </createTable>`)
    lines.push(`  </changeSet>`)
    lines.push('')
  }

  // N:M 중간 테이블 changeset
  for (const rel of relationships) {
    if (rel.type !== 'MANY_TO_MANY') continue
    const src = entities.find((e) => e.id === rel.sourceEntityId)
    const tgt = entities.find((e) => e.id === rel.targetEntityId)
    if (!src || !tgt) continue
    const srcPk = src.attributes.find((a) => a.isPrimary)
    const tgtPk = tgt.attributes.find((a) => a.isPrimary)
    if (!srcPk || !tgtPk) continue

    const joinTable = `${src.tableName}_${tgt.tableName}`
    lines.push(`  <!-- ${src.name} <-> ${tgt.name} 연결 테이블 -->`)
    lines.push(`  <changeSet id="${csId++}" author="autoerd">`)
    lines.push(`    <createTable tableName="${joinTable}">`)
    lines.push(`      <column name="${src.tableName}_id" type="BIGINT"><constraints nullable="false"/></column>`)
    lines.push(`      <column name="${tgt.tableName}_id" type="BIGINT"><constraints nullable="false"/></column>`)
    lines.push(`    </createTable>`)
    lines.push(`    <addPrimaryKey tableName="${joinTable}" columnNames="${src.tableName}_id,${tgt.tableName}_id"/>`)
    lines.push(`  </changeSet>`)
    lines.push('')
  }

  // FK constraint changeset
  const fkSeen = new Set<string>()
  for (const entity of entities) {
    for (const attr of entity.attributes) {
      if (!attr.isForeign || !attr.referencedEntityId) continue
      const refEntity = entities.find((e) => e.id === attr.referencedEntityId)
      if (!refEntity) continue
      const refPk = refEntity.attributes.find((a) => a.isPrimary)
      if (!refPk) continue

      const constraintName = `fk_${entity.tableName}_${attr.columnName}`
      if (fkSeen.has(constraintName)) continue
      fkSeen.add(constraintName)

      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '_')
      const cascadeRule = enabled.find(
        (r) =>
          r.ruleType === 'CASCADE' &&
          (r.entity === entity.name || tableOf(r.entity) === entity.tableName) &&
          (!r.column || normalize(r.column) === normalize(attr.name) || normalize(r.column) === normalize(attr.columnName)),
      )
      const onDelete = cascadeRule?.definition ?? 'NO ACTION'

      lines.push(`  <changeSet id="${csId++}" author="autoerd">`)
      lines.push(`    <addForeignKeyConstraint`)
      lines.push(`      constraintName="${constraintName}"`)
      lines.push(`      baseTableName="${entity.tableName}"`)
      lines.push(`      baseColumnNames="${attr.columnName}"`)
      lines.push(`      referencedTableName="${refEntity.tableName}"`)
      lines.push(`      referencedColumnNames="${refPk.columnName}"`)
      lines.push(`      onDelete="${onDelete}"/>`)
      lines.push(`  </changeSet>`)
      lines.push('')
    }
  }

  // CHECK / ENUM / UNIQUE / INDEX changesets
  for (const rule of enabled) {
    const tableName = tableOf(rule.entity)
    const colName = rule.column ? rule.column.toLowerCase().replace(/\s+/g, '_') : null

    if (rule.ruleType === 'CHECK' && colName) {
      lines.push(`  <changeSet id="${csId++}" author="autoerd">`)
      lines.push(`    <addCheckConstraint tableName="${tableName}" constraintName="chk_${tableName}_${colName}" checkCondition="${rule.definition.replace(/"/g, '&quot;')}"/>`)
      lines.push(`  </changeSet>`)
      lines.push('')
    }

    if (rule.ruleType === 'ENUM' && colName) {
      const values = rule.definition.split(',').map((v) => v.trim()).join(', ')
      lines.push(`  <changeSet id="${csId++}" author="autoerd">`)
      lines.push(`    <addCheckConstraint tableName="${tableName}" constraintName="chk_${tableName}_${colName}_enum" checkCondition="${colName} IN (${values})"/>`)
      lines.push(`  </changeSet>`)
      lines.push('')
    }

    if (rule.ruleType === 'INDEX' && colName) {
      lines.push(`  <changeSet id="${csId++}" author="autoerd">`)
      lines.push(`    <createIndex indexName="idx_${tableName}_${colName}" tableName="${tableName}">`)
      lines.push(`      <column name="${colName}"/>`)
      lines.push(`    </createIndex>`)
      lines.push(`  </changeSet>`)
      lines.push('')
    }
  }

  lines.push('</databaseChangeLog>')
  return lines.join('\n')
}
