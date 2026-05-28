import { useState } from 'react'
import { useEntityStore } from '../stores/entityStore'
import { Relationship, RelationType } from '../types'

const REL_LABELS: Record<RelationType, string> = {
  ONE_TO_ONE: '1:1',
  ONE_TO_MANY: '1:N',
  MANY_TO_ONE: 'N:1',
  MANY_TO_MANY: 'N:M',
}

function RelRow({ rel }: { rel: Relationship }) {
  const { entities, updateRelationship, removeRelationship } = useEntityStore()
  const src = entities.find((e) => e.id === rel.sourceEntityId)
  const tgt = entities.find((e) => e.id === rel.targetEntityId)

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50 text-sm">
      <td className="px-3 py-2">{src?.name ?? '?'}</td>
      <td className="px-3 py-2">
        <select
          className="text-sm border border-gray-200 rounded px-1 py-0.5"
          value={rel.type}
          onChange={(e) => updateRelationship(rel.id, { type: e.target.value as RelationType })}
        >
          {(Object.keys(REL_LABELS) as RelationType[]).map((t) => (
            <option key={t} value={t}>
              {REL_LABELS[t]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">{tgt?.name ?? '?'}</td>
      <td className="px-3 py-2">
        <button
          className="text-red-400 hover:text-red-600 text-xs"
          onClick={() => removeRelationship(rel.id)}
        >
          삭제
        </button>
      </td>
    </tr>
  )
}

export default function RelationshipPanel() {
  const { entities, relationships, addRelationship } = useEntityStore()
  const [srcId, setSrcId] = useState('')
  const [tgtId, setTgtId] = useState('')
  const [type, setType] = useState<RelationType>('ONE_TO_MANY')

  const handleAdd = () => {
    if (!srcId || !tgtId || srcId === tgtId) return
    addRelationship({ sourceEntityId: srcId, targetEntityId: tgtId, type })
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">관계 설정</h2>

      <div className="flex gap-2 mb-4 items-center flex-wrap">
        <select
          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[120px]"
          value={srcId}
          onChange={(e) => setSrcId(e.target.value)}
        >
          <option value="">소스 엔티티</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value as RelationType)}
        >
          {(Object.keys(REL_LABELS) as RelationType[]).map((t) => (
            <option key={t} value={t}>
              {REL_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[120px]"
          value={tgtId}
          onChange={(e) => setTgtId(e.target.value)}
        >
          <option value="">타겟 엔티티</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button
          className="bg-primary-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-primary-700 transition-colors"
          onClick={handleAdd}
        >
          추가
        </button>
      </div>

      {relationships.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">관계가 없습니다.</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 bg-gray-50">
              <th className="px-3 py-1 text-left">소스</th>
              <th className="px-3 py-1 text-left">관계</th>
              <th className="px-3 py-1 text-left">타겟</th>
              <th className="px-3 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {relationships.map((r) => (
              <RelRow key={r.id} rel={r} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
