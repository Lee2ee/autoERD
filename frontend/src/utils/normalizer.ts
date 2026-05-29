/**
 * 규칙 기반 정규화 유틸리티 (AI 불필요)
 *
 * 핵심 원리: 속성 이름 패턴으로 함수 종속성을 추론
 *   - "고객ID" + "고객명", "고객이메일" → 고객명/이메일은 고객ID에 이행 종속 → 3NF 위반
 *   - "태그목록", "이미지리스트" → 다중값 속성 → 1NF 위반
 *   - 두 FK를 가진 연결 엔티티("주문상품")의 추가 속성 → 부분 종속 가능성 → 2NF 경고
 */
import { Entity, RelationType, NormalFormLevel } from '../types'

export interface NormalizerOutput {
  entities: Array<{ name: string; description: string; attributes: string[] }>
  relationships: Array<{ source: string; target: string; type: RelationType }>
  changes: string[]
}

// FK처럼 보이는 접미사
const FK_SUFFIXES = ['ID', 'Id', '아이디', '번호']
// 다중값 속성을 나타내는 패턴
const MULTI_VALUE_PATTERNS = ['목록', '리스트', 'List', '들', '배열', 'Array']

/** "고객ID" → "고객", "상품번호" → "상품", "id" → null */
function extractFKPrefix(attrName: string): string | null {
  for (const suffix of FK_SUFFIXES) {
    if (attrName.endsWith(suffix)) {
      const prefix = attrName.slice(0, attrName.length - suffix.length)
      if (prefix.length >= 2) return prefix
    }
  }
  return null
}

/** 다중값 패턴 포함 여부 */
function isMultiValued(attrName: string): boolean {
  return MULTI_VALUE_PATTERNS.some((p) => attrName.includes(p))
}

// ─── 중간 작업 타입 ──────────────────────────────────────────────────
interface WorkingAttr {
  name: string
  isPrimary: boolean
  isForeign: boolean
}

interface WorkingEntity {
  name: string
  description: string
  attrs: WorkingAttr[]
}

function toWorking(entities: Entity[]): WorkingEntity[] {
  return entities.map((e) => ({
    name: e.name,
    description: e.description || `${e.name} 정보`,
    attrs: e.attributes.map((a) => ({
      name: a.name,
      isPrimary: a.isPrimary,
      isForeign: a.isForeign,
    })),
  }))
}

// ─── 1NF: 다중값 속성 → 연결 테이블로 분리 ──────────────────────────
function apply1NF(
  entities: WorkingEntity[],
  changes: string[],
  rels: NormalizerOutput['relationships'],
): WorkingEntity[] {
  const result: WorkingEntity[] = []
  const added = new Set<string>()

  for (const entity of entities) {
    const multiAttrs = entity.attrs.filter(
      (a) => !a.isPrimary && isMultiValued(a.name),
    )

    if (multiAttrs.length === 0) {
      result.push(entity)
      continue
    }

    // 다중값 속성 제거 후 연결 테이블 생성
    const kept = entity.attrs.filter((a) => !multiAttrs.includes(a))
    result.push({ ...entity, attrs: kept })

    for (const mv of multiAttrs) {
      // "태그목록" → "태그", "이미지리스트" → "이미지"
      const newName = MULTI_VALUE_PATTERNS.reduce(
        (n, p) => n.replace(p, ''),
        mv.name,
      ).trim() || mv.name

      const assocName = `${entity.name}${newName}`
      if (!added.has(assocName)) {
        added.add(assocName)
        result.push({
          name: assocName,
          description: `${entity.name}의 ${newName} 목록`,
          attrs: [
            { name: `${entity.name}ID`, isPrimary: true, isForeign: true },
            { name: newName, isPrimary: false, isForeign: false },
          ],
        })
        rels.push({ source: entity.name, target: assocName, type: 'ONE_TO_MANY' })
        changes.push(
          `[${entity.name}] '${mv.name}' 다중값 속성 → '${assocName}' 연결 테이블로 분리 (1NF)`,
        )
      }
    }
  }

  return result
}

// ─── 2NF: 복합 FK 엔티티의 부분 종속 경고 ──────────────────────────
function apply2NF(
  entities: WorkingEntity[],
  changes: string[],
): WorkingEntity[] {
  for (const entity of entities) {
    const fkAttrs = entity.attrs.filter(
      (a) => !a.isPrimary && extractFKPrefix(a.name) !== null,
    )
    if (fkAttrs.length < 2) continue

    // FK가 2개 이상 → 연결 엔티티로 보임
    const nonKeyAttrs = entity.attrs.filter(
      (a) => !a.isPrimary && extractFKPrefix(a.name) === null,
    )
    if (nonKeyAttrs.length > 0) {
      changes.push(
        `[${entity.name}] '${fkAttrs.map((a) => a.name).join(', ')}'를 복합키로 가지며 ` +
          `'${nonKeyAttrs.map((a) => a.name).join(', ')}'이(가) 일부 키에만 종속될 수 있습니다 (2NF 검토 권장)`,
      )
    }
  }
  // 2NF는 경고만 — 부분 종속 여부를 이름만으로 확정할 수 없으므로 구조 변경 없음
  return entities
}

// ─── 3NF: 이행 종속 제거 ────────────────────────────────────────────
function apply3NF(
  entities: WorkingEntity[],
  changes: string[],
  rels: NormalizerOutput['relationships'],
): WorkingEntity[] {
  const extracted = new Map<string, Set<string>>() // prefix → attr names
  const modified: WorkingEntity[] = []
  const existingNames = new Set(entities.map((e) => e.name))

  for (const entity of entities) {
    const toRemove = new Set<string>()

    for (const attr of entity.attrs) {
      if (attr.isPrimary || attr.isForeign) continue
      const prefix = extractFKPrefix(attr.name)
      if (!prefix) continue

      // 같은 prefix로 시작하는 비-PK/비-FK 속성 탐색
      const dependents = entity.attrs.filter(
        (a) =>
          !a.isPrimary &&
          a.name !== attr.name &&
          a.name.startsWith(prefix) &&
          extractFKPrefix(a.name) === null,
      )
      if (dependents.length === 0) continue

      if (!extracted.has(prefix)) {
        extracted.set(prefix, new Set([`${prefix}ID`]))
      }
      const bucket = extracted.get(prefix)!
      for (const dep of dependents) {
        bucket.add(dep.name)
        toRemove.add(dep.name)
      }

      if (!existingNames.has(prefix)) {
        changes.push(
          `[${entity.name}] '${dependents.map((d) => d.name).join(', ')}' → ` +
            `'${prefix}' 엔티티로 분리 (${prefix}ID에 이행 종속, 3NF)`,
        )
        // 중복 관계 방지
        if (!rels.find((r) => r.source === entity.name && r.target === prefix)) {
          rels.push({ source: entity.name, target: prefix, type: 'MANY_TO_ONE' })
        }
      }
    }

    modified.push({
      ...entity,
      attrs: entity.attrs.filter((a) => !toRemove.has(a.name)),
    })
  }

  // 새로 추출된 엔티티 추가
  for (const [prefix, attrSet] of extracted) {
    if (!existingNames.has(prefix)) {
      const attrList = [...attrSet]
      modified.push({
        name: prefix,
        description: `${prefix} 정보`,
        attrs: attrList.map((name, i) => ({
          name,
          isPrimary: i === 0,
          isForeign: false,
        })),
      })
    }
  }

  return modified
}

// ─── BCNF: 3NF 적용 후 후보키가 아닌 결정자 탐지 ─────────────────
function applyBCNF(
  entities: WorkingEntity[],
  changes: string[],
): WorkingEntity[] {
  // 실용적 BCNF: 3NF 이후에도 UNIQUE 제약이 될 만한 속성이
  // 다른 속성을 결정하는지 이름 패턴으로 탐지
  for (const entity of entities) {
    const codeAttrs = entity.attrs.filter(
      (a) =>
        !a.isPrimary &&
        (a.name.endsWith('코드') || a.name.endsWith('Code') || a.name.endsWith('코드번호')),
    )
    for (const codeAttr of codeAttrs) {
      const prefix = codeAttr.name.replace(/(코드번호|코드|Code)$/, '')
      const governed = entity.attrs.filter(
        (a) => !a.isPrimary && a.name !== codeAttr.name && a.name.startsWith(prefix),
      )
      if (governed.length > 0) {
        changes.push(
          `[${entity.name}] '${codeAttr.name}'이(가) '${governed.map((a) => a.name).join(', ')}'을(를) 결정합니다. ` +
            `후보키가 아닌 결정자이므로 별도 엔티티 분리를 검토하세요 (BCNF)`,
        )
      }
    }
  }
  return entities
}

// ─── 공개 API ────────────────────────────────────────────────────────
export function normalizeRuleBased(
  entities: Entity[],
  level: NormalFormLevel,
): NormalizerOutput {
  const changes: string[] = []
  const rels: NormalizerOutput['relationships'] = []

  let working = toWorking(entities)

  if (['1NF', '2NF', '3NF', 'BCNF'].includes(level)) {
    working = apply1NF(working, changes, rels)
  }
  if (['2NF', '3NF', 'BCNF'].includes(level)) {
    working = apply2NF(working, changes)
  }
  if (['3NF', 'BCNF'].includes(level)) {
    working = apply3NF(working, changes, rels)
  }
  if (level === 'BCNF') {
    working = applyBCNF(working, changes)
  }

  if (changes.length === 0) {
    changes.push(`현재 엔티티 구조에서 ${level} 위반이 발견되지 않았습니다.`)
  }

  return {
    entities: working.map((e) => ({
      name: e.name,
      description: e.description,
      attributes: e.attrs.map((a) => a.name),
    })),
    relationships: rels,
    changes,
  }
}
