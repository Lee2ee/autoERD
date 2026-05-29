import { useState } from 'react'
import toast from 'react-hot-toast'
import { useRequirementStore } from '../stores/requirementStore'
import { useEntityStore } from '../stores/entityStore'
import { analyzeRequirement } from '../api'
import { v4 as uuidv4 } from 'uuid'
import { toSnakeCase } from '../utils/naming'
import { DataType, Attribute, BusinessRule, RateLimitInfo } from '../types'

export default function RequirementInput() {
  const { text, setText, isAnalyzing, setAnalyzing, setError, rateLimit, setRateLimit } = useRequirementStore()
  const { entities, addEntity, addRelationship, updateAttribute, setBusinessRules, addBusinessRules, reset } = useEntityStore()
  const [localText, setLocalText] = useState(text)
  const [modalOpen, setModalOpen] = useState(false)
  const hasEntities = entities.length > 0

  const handleAnalyze = async (textToAnalyze = localText, merge = false) => {
    if (!textToAnalyze.trim()) {
      toast.error('요구사항을 입력해주세요.')
      return
    }
    setLocalText(textToAnalyze)
    setText(textToAnalyze)
    setAnalyzing(true)
    setError(null)
    setModalOpen(false)

    try {
      const result = await analyzeRequirement(textToAnalyze)

      if (!merge) reset()

      // 기존 엔티티 이름 → id 맵 (merge 시 중복 방지)
      const entityIdMap: Record<string, string> = {}
      if (merge) {
        for (const e of useEntityStore.getState().entities) {
          entityIdMap[e.name] = e.id
        }
      }

      let newEntityCount = 0
      for (const e of result.entities) {
        if (entityIdMap[e.name]) continue  // 이미 존재하는 엔티티는 스킵
        const entity = addEntity(e.name, e.description)
        entityIdMap[e.name] = entity.id
        newEntityCount++

        for (const attrName of e.attributes) {
          const columnName = toSnakeCase(attrName)
          const existing = useEntityStore.getState().entities
            .find((en) => en.id === entity.id)
            ?.attributes.some((a) => a.columnName === columnName)
          if (existing) continue

          const attr: Partial<Attribute> = {
            id: uuidv4(),
            name: attrName,
            columnName,
            type: inferType(attrName),
            isNullable: true,
            isPrimary: false,
            isForeign: false,
            isUnique: false,
          }
          useEntityStore.getState().addAttribute(entity.id, attr)
        }
      }

      // 관계 추가 (merge 시 중복 제거)
      const existingRels = useEntityStore.getState().relationships
      let newRelCount = 0
      for (const rel of result.relationships) {
        const srcId = entityIdMap[rel.source]
        const tgtId = entityIdMap[rel.target]
        if (!srcId || !tgtId) continue
        if (merge && existingRels.some((r) => r.sourceEntityId === srcId && r.targetEntityId === tgtId)) continue
        addRelationship({ sourceEntityId: srcId, targetEntityId: tgtId, type: rel.type })
        newRelCount++
      }

      // 업무 규칙 처리
      const rawRules = result.business_rules ?? []
      const businessRules: BusinessRule[] = rawRules.map((r) => ({
        id: uuidv4(),
        entity: r.entity,
        column: r.column,
        ruleType: r.rule_type,
        definition: r.definition,
        description: r.description,
        enabled: true,
      }))

      // NULLABLE 규칙 → 속성에 즉시 반영
      const currentEntities = useEntityStore.getState().entities
      for (const rule of businessRules) {
        if (rule.ruleType !== 'NULLABLE' || !rule.column) continue
        const entity = currentEntities.find(
          (e) => e.name === rule.entity || e.tableName === toSnakeCase(rule.entity)
        )
        if (!entity) continue
        const attr = entity.attributes.find(
          (a) => a.name === rule.column || a.columnName === toSnakeCase(rule.column!)
        )
        if (attr) {
          updateAttribute(entity.id, attr.id, { isNullable: rule.definition === 'NULL' })
        }
      }

      // UNIQUE 규칙 → 속성에 즉시 반영
      for (const rule of businessRules) {
        if (rule.ruleType !== 'UNIQUE' || !rule.column) continue
        const entity = currentEntities.find(
          (e) => e.name === rule.entity || e.tableName === toSnakeCase(rule.entity)
        )
        if (!entity) continue
        const attr = entity.attributes.find(
          (a) => a.name === rule.column || a.columnName === toSnakeCase(rule.column!)
        )
        if (attr) {
          updateAttribute(entity.id, attr.id, { isUnique: true })
        }
      }

      // DEFAULT 규칙 → 속성에 즉시 반영
      for (const rule of businessRules) {
        if (rule.ruleType !== 'DEFAULT' || !rule.column) continue
        const entity = currentEntities.find(
          (e) => e.name === rule.entity || e.tableName === toSnakeCase(rule.entity)
        )
        if (!entity) continue
        const attr = entity.attributes.find(
          (a) => a.name === rule.column || a.columnName === toSnakeCase(rule.column!)
        )
        if (attr) {
          updateAttribute(entity.id, attr.id, { defaultValue: rule.definition })
        }
      }

      // AUDIT 규칙 → created_at / updated_at 컬럼 자동 추가
      for (const rule of businessRules) {
        if (rule.ruleType !== 'AUDIT') continue
        const entity = currentEntities.find(
          (e) => e.name === rule.entity || e.tableName === toSnakeCase(rule.entity)
        )
        if (!entity) continue
        const hasCreatedAt = entity.attributes.some((a) => a.columnName === 'created_at')
        const hasUpdatedAt = entity.attributes.some((a) => a.columnName === 'updated_at')
        if (!hasCreatedAt) {
          useEntityStore.getState().addAttribute(entity.id, {
            name: '생성일시',
            columnName: 'created_at',
            type: 'TIMESTAMP',
            isNullable: false,
            isPrimary: false,
            isForeign: false,
            isUnique: false,
            defaultValue: 'NOW()',
          })
        }
        if (!hasUpdatedAt) {
          useEntityStore.getState().addAttribute(entity.id, {
            name: '수정일시',
            columnName: 'updated_at',
            type: 'TIMESTAMP',
            isNullable: false,
            isPrimary: false,
            isForeign: false,
            isUnique: false,
            defaultValue: 'NOW()',
          })
        }
      }

      if (merge) {
        addBusinessRules(businessRules)
      } else {
        setBusinessRules(businessRules)
      }

      if (result.rate_limit) setRateLimit(result.rate_limit)

      const summary = merge
        ? `엔티티 ${newEntityCount}개 추가, 관계 ${newRelCount}개 추가, 업무 규칙 ${businessRules.length}개 병합`
        : `${result.entities.length}개 엔티티, ${result.relationships.length}개 관계, ${businessRules.length}개 업무 규칙 추출 완료`
      toast.success(summary)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.'
      setError(msg)
      toast.error(msg)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">요구사항 입력</h2>
        </div>
        {localText.trim() && (
          <p className="text-sm text-gray-500 mb-3 line-clamp-3">{localText}</p>
        )}
        <button
          className="w-full bg-primary-600 text-white py-2 rounded-md text-sm font-medium hover:bg-primary-700 transition-colors"
          onClick={() => setModalOpen(true)}
        >
          {localText.trim() ? '요구사항 수정 / 재분석' : '요구사항 작성하기'}
        </button>
        {rateLimit && <RateLimitBar info={rateLimit} />}
      </div>

      {modalOpen && (
        <RequirementModal
          initialText={localText}
          isAnalyzing={isAnalyzing}
          hasEntities={hasEntities}
          onAnalyze={handleAnalyze}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

const KIWI_LIMIT = 8000   // 이 이상이면 일부 텍스트만 형태소 분석
const MAX_LIMIT = 20000   // 서버 최대 허용 길이

function RequirementModal({
  initialText,
  isAnalyzing,
  hasEntities,
  onAnalyze,
  onClose,
}: {
  initialText: string
  isAnalyzing: boolean
  hasEntities: boolean
  onAnalyze: (text: string, merge: boolean) => void
  onClose: () => void
}) {
  const [text, setText] = useState(initialText)
  const len = text.length
  const isOverLimit = len > MAX_LIMIT
  const isNearLimit = len > KIWI_LIMIT && !isOverLimit

  const counterColor = isOverLimit
    ? 'text-red-500 font-semibold'
    : isNearLimit
    ? 'text-yellow-500'
    : 'text-gray-400'

  const borderColor = isOverLimit
    ? 'border-red-400 focus:ring-red-400'
    : isNearLimit
    ? 'border-yellow-400 focus:ring-yellow-400'
    : 'border-gray-300 focus:ring-primary-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full" style={{ maxWidth: '900px', height: '90vh' }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">요구사항 입력</h2>
            <p className="text-xs text-gray-400 mt-0.5">자유롭게 서술하면 AI가 엔티티·관계·업무규칙을 자동 추출합니다</p>
          </div>
          <button
            className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden gap-1.5">
          <textarea
            className={`flex-1 border rounded-lg p-4 text-sm resize-none focus:outline-none focus:ring-2 leading-relaxed font-sans ${borderColor}`}
            placeholder={`시스템 요구사항을 자유롭게 서술하세요.\n\n예시:\n회원은 여러 상품을 주문할 수 있다.\n주문에는 배송정보와 결제정보가 포함된다.\n상품은 카테고리로 분류된다.\n이메일은 중복 불가이며 주문금액은 0보다 커야 한다.\n회원 탈퇴 시 주문 내역은 보존해야 한다.`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey && !isOverLimit) onAnalyze(text, true) }}
            autoFocus
          />
          {/* 글자 수 / 경고 */}
          <div className="flex items-center justify-between px-1">
            {isOverLimit ? (
              <span className="text-xs text-red-500">최대 {MAX_LIMIT.toLocaleString()}자를 초과했습니다. 텍스트를 줄여주세요.</span>
            ) : isNearLimit ? (
              <span className="text-xs text-yellow-600">{KIWI_LIMIT.toLocaleString()}자 초과 시 앞부분({KIWI_LIMIT.toLocaleString()}자)만 형태소 분석됩니다.</span>
            ) : (
              <span />
            )}
            <span className={`text-xs ${counterColor}`}>
              {len.toLocaleString()} / {MAX_LIMIT.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-between items-center px-6 py-3 border-t border-gray-200 flex-shrink-0">
          <span className="text-xs text-gray-400">Ctrl+Enter로 추가 분석 · 배경 클릭으로 닫기</span>
          <div className="flex gap-2">
            <button
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-md text-sm hover:bg-gray-50 transition-colors"
              onClick={onClose}
            >
              취소
            </button>
            {hasEntities && (
              <button
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                onClick={() => onAnalyze(text, false)}
                disabled={isAnalyzing || isOverLimit}
                title="기존 엔티티를 모두 지우고 새로 분석"
              >
                초기화 후 분석
              </button>
            )}
            <button
              className="bg-primary-600 text-white px-6 py-2 rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onClick={() => onAnalyze(text, hasEntities)}
              disabled={isAnalyzing || isOverLimit}
            >
              {isAnalyzing ? '분석 중...' : hasEntities ? '추가 분석' : 'AI 분석'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RateLimitBar({ info }: { info: RateLimitInfo }) {
  const tokenPct = info.limit_tokens && info.remaining_tokens != null
    ? Math.round((info.remaining_tokens / info.limit_tokens) * 100)
    : null
  const reqPct = info.limit_requests && info.remaining_requests != null
    ? Math.round((info.remaining_requests / info.limit_requests) * 100)
    : null

  const barColor = (pct: number) =>
    pct > 50 ? 'bg-green-400' : pct > 20 ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
      <p className="text-xs font-medium text-gray-500">Groq 사용량 (분당)</p>
      {tokenPct !== null && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-0.5">
            <span>토큰</span>
            <span>{info.remaining_tokens?.toLocaleString()} / {info.limit_tokens?.toLocaleString()}{info.reset_tokens ? ` · ${info.reset_tokens} 후 리셋` : ''}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor(tokenPct)}`} style={{ width: `${tokenPct}%` }} />
          </div>
        </div>
      )}
      {reqPct !== null && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-0.5">
            <span>요청</span>
            <span>{info.remaining_requests} / {info.limit_requests}{info.reset_requests ? ` · ${info.reset_requests} 후 리셋` : ''}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor(reqPct)}`} style={{ width: `${reqPct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

function inferType(name: string): DataType {
  const lower = name.toLowerCase()
  if (lower.includes('날짜') || lower.includes('일시') || lower.includes('date')) return 'TIMESTAMP'
  if (lower.includes('가격') || lower.includes('금액') || lower.includes('price') || lower.includes('amount')) return 'DECIMAL'
  if (lower.includes('수량') || lower.includes('count') || lower.includes('quantity')) return 'INTEGER'
  if (lower.includes('여부') || lower.includes('flag') || lower.includes('is_') || lower.includes('enabled')) return 'BOOLEAN'
  if (lower.includes('내용') || lower.includes('설명') || lower.includes('description') || lower.includes('content')) return 'TEXT'
  return 'VARCHAR'
}
