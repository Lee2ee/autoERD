import { useState } from 'react'
import toast from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'
import { useEntityStore } from '../stores/entityStore'
import { normalizeEntities } from '../api'
import { NormalFormLevel, Attribute, DataType } from '../types'
import { toSnakeCase } from '../utils/naming'
import { normalizeRuleBased, NormalizerOutput } from '../utils/normalizer'

const LEVELS: Array<{ value: NormalFormLevel; label: string; desc: string }> = [
  { value: '1NF', label: '1NF', desc: '원자값 · 기본키 보장' },
  { value: '2NF', label: '2NF', desc: '부분 종속 제거' },
  { value: '3NF', label: '3NF', desc: '이행 종속 제거' },
  { value: 'BCNF', label: 'BCNF', desc: '완전 함수 종속 보장' },
]

function inferType(name: string): DataType {
  const lower = name.toLowerCase()
  if (lower.includes('날짜') || lower.includes('일시') || lower.includes('date')) return 'TIMESTAMP'
  if (lower.includes('가격') || lower.includes('금액') || lower.includes('amount')) return 'DECIMAL'
  if (lower.includes('수량') || lower.includes('count')) return 'INTEGER'
  if (lower.includes('여부') || lower.includes('flag')) return 'BOOLEAN'
  if (lower.includes('내용') || lower.includes('설명')) return 'TEXT'
  return 'VARCHAR'
}

export default function NormalizationPanel() {
  const { entities } = useEntityStore()
  const { reset, addEntity, addRelationship } = useEntityStore()
  const [level, setLevel] = useState<NormalFormLevel>('3NF')
  const [useAI, setUseAI] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [changes, setChanges] = useState<string[]>([])

  if (entities.length === 0) return (
    <div className="bg-white rounded-lg shadow p-4 text-center text-sm text-gray-400 py-10">
      요구사항을 먼저 분석하거나<br />엔티티를 추가해주세요.
    </div>
  )

  const handleNormalize = async () => {
    setIsLoading(true)
    setChanges([])
    try {
      let result: NormalizerOutput

      if (useAI) {
        const input = entities.map((e) => ({
          name: e.name,
          attributes: e.attributes.map((a) => a.name),
        }))
        result = await normalizeEntities(input, level)
      } else {
        result = normalizeRuleBased(entities, level)
      }

      // 기존 카드 fade-out 애니메이션 대기
      setIsExiting(true)
      const entityCards = document.querySelectorAll<HTMLElement>('.animate-entity-enter')
      entityCards.forEach((el) => el.classList.add('animate-entity-exit'))
      await new Promise((r) => setTimeout(r, 220))
      setIsExiting(false)

      // reset 전에 기존 관계·업무규칙 저장
      const prevState = useEntityStore.getState()
      const prevRelationships = prevState.relationships
      const prevBusinessRules = prevState.businessRules
      // 기존 엔티티 id → name 매핑 (관계 복원에 사용)
      const prevIdToName: Record<string, string> = {}
      for (const e of prevState.entities) {
        prevIdToName[e.id] = e.name
      }

      reset()

      // 정규화된 엔티티 적용
      const entityIdMap: Record<string, string> = {}
      // 결과 엔티티명 집합 — FK 참조 속성 필터링에 사용
      const resultEntityNames = new Set(result.entities.map((e) => e.name))
      // FK_SUFFIXES: normalizer.ts와 동일한 기준
      const FK_SUFFIXES = ['ID', 'Id', '아이디', '번호']

      /** 다른 결과 엔티티를 참조하는 FK-like 속성인지 판별
       *  (e.g. "고객ID" → prefix "고객" → resultEntityNames에 존재 → true)
       *  단, 자기 자신 엔티티의 자연키(e.g. 고객 엔티티의 고객ID)는 스킵하지 않음
       *  addRelationship이 올바른 isForeign/referencedEntityId와 함께 자동 생성하므로 스킵
       */
      const isFKRef = (attrName: string, entityName: string) =>
        FK_SUFFIXES.some((suffix) => {
          if (!attrName.endsWith(suffix)) return false
          const prefix = attrName.slice(0, -suffix.length)
          return prefix.length >= 2 && resultEntityNames.has(prefix) && prefix !== entityName
        })

      for (const e of result.entities) {
        const entity = addEntity(e.name, e.description)
        entityIdMap[e.name] = entity.id

        for (const attrName of e.attributes) {
          // 다른 엔티티를 참조하는 FK 속성은 스킵 — addRelationship이 메타데이터 포함해 자동 추가
          if (isFKRef(attrName, e.name)) continue

          const columnName = toSnakeCase(attrName)
          const existing = useEntityStore.getState().entities
            .find((en) => en.id === entity.id)
            ?.attributes.some((a) => a.columnName === columnName)
          if (existing) continue

          // 자기 자신 엔티티의 자연키(e.g. 고객 엔티티의 고객ID)는 NOT NULL + UNIQUE
          const isNaturalKey = FK_SUFFIXES.some((suffix) => {
            if (!attrName.endsWith(suffix)) return false
            return attrName.slice(0, -suffix.length) === e.name
          })
          const attr: Partial<Attribute> = {
            id: uuidv4(),
            name: attrName,
            columnName,
            type: inferType(attrName),
            isNullable: !isNaturalKey,
            isPrimary: false,
            isForeign: false,
            isUnique: isNaturalKey,
          }
          useEntityStore.getState().addAttribute(entity.id, attr)
        }
      }

      // 정규화 결과 관계 복원
      const addedRelPairs = new Set<string>()
      for (const rel of result.relationships) {
        const srcId = entityIdMap[rel.source]
        const tgtId = entityIdMap[rel.target]
        if (srcId && tgtId) {
          addRelationship({ sourceEntityId: srcId, targetEntityId: tgtId, type: rel.type })
          addedRelPairs.add(`${srcId}:${tgtId}`)
        }
      }

      // 기존 관계 중 두 엔티티 모두 새 목록에 존재하는 것 복원 (중복 제외)
      for (const rel of prevRelationships) {
        const srcName = prevIdToName[rel.sourceEntityId]
        const tgtName = prevIdToName[rel.targetEntityId]
        const srcId = entityIdMap[srcName]
        const tgtId = entityIdMap[tgtName]
        if (srcId && tgtId && !addedRelPairs.has(`${srcId}:${tgtId}`)) {
          addRelationship({ sourceEntityId: srcId, targetEntityId: tgtId, type: rel.type })
          addedRelPairs.add(`${srcId}:${tgtId}`)
        }
      }

      // 업무 규칙 복원 (엔티티가 새 목록에 존재하는 것만)
      const newEntityNames = new Set(Object.keys(entityIdMap))
      const rulesToRestore = prevBusinessRules.filter((r) => newEntityNames.has(r.entity))
      if (rulesToRestore.length > 0) {
        useEntityStore.getState().addBusinessRules(rulesToRestore)
      }

      setChanges(result.changes)
      toast.success(`${level} 정규화 완료 — ${result.entities.length}개 엔티티`)
    } catch (err) {
      toast.error('정규화 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800">정규화</h2>
        {/* AI / 규칙 기반 토글 */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className={useAI ? 'text-gray-400' : 'text-gray-700 font-medium'}>규칙 기반</span>
          <button
            onClick={() => setUseAI((v) => !v)}
            className={`relative w-10 h-5 flex-shrink-0 rounded-full transition-colors ${useAI ? 'bg-primary-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useAI ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <span className={useAI ? 'text-primary-600 font-medium' : 'text-gray-400'}>AI</span>
        </div>
      </div>

      {/* 정규형 선택 */}
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {LEVELS.map(({ value, label, desc }) => (
          <button
            key={value}
            onClick={() => setLevel(value)}
            className={`text-left px-3 py-2 rounded-md border text-xs transition-colors ${
              level === value
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="font-semibold">{label}</div>
            <div className="text-gray-400 mt-0.5">{desc}</div>
          </button>
        ))}
      </div>

      <button
        onClick={handleNormalize}
        disabled={isLoading || isExiting}
        className="w-full bg-primary-600 text-white py-2 rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isExiting ? '적용 중...' : isLoading ? '정규화 처리 중...' : `${level} 적용 ${useAI ? '(AI)' : '(규칙 기반)'}`}
      </button>

      {/* 변경 내역 */}
      {changes.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-1.5">변경 내역</p>
          <ul className="space-y-1">
            {changes.map((c, i) => (
              <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                <span className="text-primary-400 mt-0.5 flex-shrink-0">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
