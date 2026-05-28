import { useState } from 'react'
import { useEntityStore } from '../stores/entityStore'
import { Entity, Attribute, DataType } from '../types'

const DATA_TYPES: DataType[] = [
  'VARCHAR', 'TEXT', 'INTEGER', 'BIGINT', 'DECIMAL',
  'BOOLEAN', 'TIMESTAMP', 'DATE', 'UUID', 'FLOAT', 'JSON',
]

function AttributeRow({
  entityId,
  attr,
}: {
  entityId: string
  attr: Attribute
}) {
  const { updateAttribute, removeAttribute } = useEntityStore()

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-2 py-1">
        <input
          className="w-full text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary-500 rounded px-1"
          value={attr.name}
          onChange={(e) => updateAttribute(entityId, attr.id, { name: e.target.value })}
        />
      </td>
      <td className="px-2 py-1">
        <input
          className="w-full text-sm border-0 bg-transparent font-mono focus:outline-none focus:ring-1 focus:ring-primary-500 rounded px-1 text-gray-500"
          value={attr.columnName}
          onChange={(e) => updateAttribute(entityId, attr.id, { columnName: e.target.value })}
        />
      </td>
      <td className="px-2 py-1">
        <select
          className="text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary-500 rounded"
          value={attr.type}
          onChange={(e) => updateAttribute(entityId, attr.id, { type: e.target.value as DataType })}
        >
          {DATA_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1 text-center">
        <input
          type="checkbox"
          checked={attr.isPrimary}
          onChange={(e) => updateAttribute(entityId, attr.id, { isPrimary: e.target.checked })}
        />
      </td>
      <td className="px-2 py-1 text-center">
        <input
          type="checkbox"
          checked={attr.isNullable}
          onChange={(e) => updateAttribute(entityId, attr.id, { isNullable: e.target.checked })}
        />
      </td>
      <td className="px-2 py-1 text-center">
        <input
          type="checkbox"
          checked={attr.isUnique}
          onChange={(e) => updateAttribute(entityId, attr.id, { isUnique: e.target.checked })}
        />
      </td>
      <td className="px-2 py-1 text-center">
        <button
          className="text-red-400 hover:text-red-600 text-xs"
          onClick={() => removeAttribute(entityId, attr.id)}
        >
          삭제
        </button>
      </td>
    </tr>
  )
}

function EntityCard({ entity }: { entity: Entity }) {
  const { updateEntity, removeEntity, addAttribute } = useEntityStore()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="bg-white rounded-lg shadow mb-4 overflow-hidden border border-gray-200">
      <div className="flex items-center justify-between px-4 py-2 bg-primary-600 text-white">
        <div className="flex items-center gap-2 flex-1">
          <input
            className="bg-transparent font-semibold text-sm focus:outline-none focus:underline w-32"
            value={entity.name}
            onChange={(e) => updateEntity(entity.id, { name: e.target.value })}
          />
          <span className="text-primary-200 text-xs font-mono">({entity.tableName})</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-primary-200 hover:text-white text-xs" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? '펼치기' : '접기'}
          </button>
          <button
            className="text-red-300 hover:text-red-100 text-xs"
            onClick={() => removeEntity(entity.id)}
          >
            삭제
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="px-4 py-1 bg-gray-50 border-b border-gray-200">
            <input
              className="w-full text-xs text-gray-500 bg-transparent focus:outline-none"
              placeholder="엔티티 설명..."
              value={entity.description}
              onChange={(e) => updateEntity(entity.id, { description: e.target.value })}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 bg-gray-50">
                  <th className="px-2 py-1 text-left">컬럼명</th>
                  <th className="px-2 py-1 text-left">DB 컬럼</th>
                  <th className="px-2 py-1 text-left">타입</th>
                  <th className="px-2 py-1 text-center">PK</th>
                  <th className="px-2 py-1 text-center">NULL</th>
                  <th className="px-2 py-1 text-center">UQ</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {entity.attributes.map((attr) => (
                  <AttributeRow key={attr.id} entityId={entity.id} attr={attr} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100">
            <button
              className="text-primary-600 hover:text-primary-800 text-sm font-medium"
              onClick={() => addAttribute(entity.id)}
            >
              + 컬럼 추가
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function EntityTable() {
  const { entities, addEntity } = useEntityStore()

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">엔티티 목록 ({entities.length})</h2>
        <button
          className="bg-primary-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary-700 transition-colors"
          onClick={() => addEntity('새 엔티티')}
        >
          + 엔티티 추가
        </button>
      </div>
      {entities.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          요구사항을 분석하거나 엔티티를 직접 추가하세요.
        </div>
      ) : (
        entities.map((e) => <EntityCard key={e.id} entity={e} />)
      )}
    </div>
  )
}
