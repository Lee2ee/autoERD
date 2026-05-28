import { useState } from 'react'
import toast from 'react-hot-toast'
import { useRequirementStore } from '../stores/requirementStore'
import { useEntityStore } from '../stores/entityStore'
import { analyzeRequirement } from '../api'
import { v4 as uuidv4 } from 'uuid'
import { toSnakeCase } from '../utils/naming'
import { DataType, Attribute } from '../types'

export default function RequirementInput() {
  const { text, setText, isAnalyzing, setAnalyzing, setError } = useRequirementStore()
  const { addEntity, addRelationship, reset } = useEntityStore()
  const [localText, setLocalText] = useState(text)
  const [modalOpen, setModalOpen] = useState(false)

  const handleAnalyze = async (textToAnalyze = localText) => {
    if (!textToAnalyze.trim()) {
      toast.error('요구사항을 입력해주세요.')
      return
    }
    setLocalText(textToAnalyze)
    setText(textToAnalyze)
    setAnalyzing(true)
    setError(null)

    try {
      const result = await analyzeRequirement(textToAnalyze)
      reset()

      const entityIdMap: Record<string, string> = {}

      for (const e of result.entities) {
        const entity = addEntity(e.name, e.description)
        entityIdMap[e.name] = entity.id

        for (const attrName of e.attributes) {
          const attr: Partial<Attribute> = {
            id: uuidv4(),
            name: attrName,
            columnName: toSnakeCase(attrName),
            type: inferType(attrName),
            isNullable: true,
            isPrimary: false,
            isForeign: false,
            isUnique: false,
          }
          useEntityStore.getState().addAttribute(entity.id, attr)
        }
      }

      for (const rel of result.relationships) {
        const srcId = entityIdMap[rel.source]
        const tgtId = entityIdMap[rel.target]
        if (srcId && tgtId) {
          addRelationship({ sourceEntityId: srcId, targetEntityId: tgtId, type: rel.type })
        }
      }

      toast.success(`${result.entities.length}개 엔티티, ${result.relationships.length}개 관계 추출 완료`)
      setModalOpen(false)
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
      </div>

      {modalOpen && (
        <RequirementModal
          initialText={localText}
          isAnalyzing={isAnalyzing}
          onAnalyze={handleAnalyze}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

function RequirementModal({
  initialText,
  isAnalyzing,
  onAnalyze,
  onClose,
}: {
  initialText: string
  isAnalyzing: boolean
  onAnalyze: (text: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState(initialText)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col" style={{ height: '80vh' }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">요구사항 입력</h2>
          <button
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 flex flex-col p-6 gap-3 overflow-hidden">
          <p className="text-sm text-gray-500">
            시스템 요구사항을 자유롭게 서술하세요. AI가 엔티티와 관계를 자동으로 추출합니다.
          </p>
          <textarea
            className="flex-1 border border-gray-300 rounded-lg p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 leading-relaxed"
            placeholder={`예시:\n회원은 여러 상품을 주문할 수 있다.\n주문에는 배송정보와 결제정보가 포함된다.\n상품은 카테고리로 분류된다.\n관리자는 상품과 회원을 관리한다.`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) onAnalyze(text) }}
            autoFocus
          />
        </div>

        {/* 푸터 */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200">
          <span className="text-xs text-gray-400">Ctrl+Enter로 분석 · 배경 클릭으로 닫기</span>
          <div className="flex gap-2">
            <button
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-md text-sm hover:bg-gray-50"
              onClick={onClose}
            >
              취소
            </button>
            <button
              className="bg-primary-600 text-white px-6 py-2 rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onClick={() => onAnalyze(text)}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? '분석 중...' : 'AI 분석'}
            </button>
          </div>
        </div>
      </div>
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
