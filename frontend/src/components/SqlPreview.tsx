import { useMemo, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import toast from 'react-hot-toast'
import { useEntityStore } from '../stores/entityStore'
import { generateDDL } from '../utils/ddlGenerator'

export default function SqlPreview() {
  const { entities, relationships } = useEntityStore()

  const sql = useMemo(() => generateDDL(entities, relationships), [entities, relationships])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(sql).then(() => toast.success('SQL 복사됨'))
  }, [sql])

  const handleDownload = useCallback(() => {
    const blob = new Blob([sql], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'schema.sql'
    a.click()
    URL.revokeObjectURL(url)
  }, [sql])

  return (
    <div className="bg-white rounded-lg shadow flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">SQL DDL 미리보기</h2>
        <div className="flex gap-2">
          <button
            className="text-sm border border-gray-300 text-gray-600 px-3 py-1 rounded hover:bg-gray-50 transition-colors"
            onClick={handleCopy}
          >
            복사
          </button>
          <button
            className="text-sm bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700 transition-colors"
            onClick={handleDownload}
          >
            다운로드
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="sql"
          value={sql || '-- 엔티티를 추가하면 DDL이 자동 생성됩니다.'}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
          theme="vs-light"
        />
      </div>
    </div>
  )
}
