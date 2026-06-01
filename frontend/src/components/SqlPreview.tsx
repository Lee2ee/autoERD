import { useMemo, useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import toast from 'react-hot-toast'
import { useEntityStore } from '../stores/entityStore'
import { generateDDL, generateFlywayDDL, generateLiquibaseDDL } from '../utils/ddlGenerator'

type Format = 'postgresql' | 'flyway' | 'liquibase'

const FORMATS: Array<{ value: Format; label: string; ext: string; lang: string }> = [
  { value: 'postgresql', label: 'PostgreSQL',  ext: 'schema.sql',               lang: 'sql'  },
  { value: 'flyway',     label: 'Flyway SQL',  ext: 'V1__create_schema.sql',    lang: 'sql'  },
  { value: 'liquibase',  label: 'Liquibase XML', ext: 'db.changelog-master.xml', lang: 'xml' },
]

export default function SqlPreview() {
  const { entities, relationships, businessRules } = useEntityStore()
  const [format, setFormat] = useState<Format>('postgresql')

  const content = useMemo(() => {
    if (format === 'flyway')    return generateFlywayDDL(entities, relationships, businessRules)
    if (format === 'liquibase') return generateLiquibaseDDL(entities, relationships, businessRules)
    return generateDDL(entities, relationships, businessRules)
  }, [entities, relationships, businessRules, format])

  const currentFormat = FORMATS.find((f) => f.value === format)!

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => toast.success('복사됨'))
  }, [content])

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = currentFormat.ext
    a.click()
    URL.revokeObjectURL(url)
  }, [content, currentFormat])

  return (
    <div className="bg-white rounded-lg shadow flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-800">SQL DDL 미리보기</h2>
        <div className="flex items-center gap-2">
          {/* 포맷 선택 */}
          <div className="flex bg-gray-100 rounded-md p-0.5 gap-0.5">
            {FORMATS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFormat(value)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  format === value
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="text-sm border border-gray-300 text-gray-600 px-3 py-1 rounded hover:bg-gray-50 transition-colors"
            onClick={handleCopy}
          >
            복사
          </button>
          <button
            className="text-sm bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700 transition-colors"
            onClick={handleDownload}
            title={`다운로드: ${currentFormat.ext}`}
          >
            다운로드
          </button>
        </div>
      </div>
      {format === 'flyway' && (
        <div className="px-4 py-1.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-600">
          파일명 규칙: <code className="font-mono">V{'{버전}'}__create_schema.sql</code> — 다운로드 후 Flyway
          마이그레이션 폴더에 배치하세요.
        </div>
      )}
      {format === 'liquibase' && (
        <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
          Liquibase XML changeSet — <code className="font-mono">db.changelog-master.xml</code>으로 저장해
          사용하세요.
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={currentFormat.lang}
          value={content || (format === 'liquibase'
            ? '<!-- 엔티티를 추가하면 Liquibase XML이 자동 생성됩니다. -->'
            : '-- 엔티티를 추가하면 DDL이 자동 생성됩니다.')}
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
