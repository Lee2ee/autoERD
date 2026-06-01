import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { v4 as uuidv4 } from 'uuid'
import { useEntityStore } from '../stores/entityStore'
import { parseJpaEntities, parsePrismaSchema, ParseResult } from '../utils/codeParser'

type ParseMode = 'jpa' | 'prisma'

interface Props {
  onClose: () => void
}

export default function CodeImportModal({ onClose }: Props) {
  const [mode, setMode] = useState<ParseMode>('jpa')
  const [code, setCode] = useState('')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { entities: existingEntities, addEntity, addRelationship } = useEntityStore()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const readers = files.map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target?.result as string)
          reader.readAsText(file)
        }),
    )
    Promise.all(readers).then((contents) => {
      setCode(contents.join('\n\n'))
      setResult(null)
    })
  }

  const handleParse = () => {
    if (!code.trim()) {
      toast.error('코드를 입력하거나 파일을 업로드해주세요.')
      return
    }
    setIsLoading(true)
    try {
      const parsed = mode === 'jpa' ? parseJpaEntities(code) : parsePrismaSchema(code)
      setResult(parsed)
    } catch {
      toast.error('파싱 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = () => {
    if (!result || result.entities.length === 0) return

    const existingNames = new Set(existingEntities.map((e) => e.name))
    const entityIdMap: Record<string, string> = {}

    let addedCount = 0
    for (const entity of result.entities) {
      if (existingNames.has(entity.name)) {
        // 이미 존재하는 엔티티는 ID만 매핑
        const existing = existingEntities.find((e) => e.name === entity.name)
        if (existing) entityIdMap[entity.name] = existing.id
        continue
      }
      const added = addEntity(entity.name, entity.description)
      entityIdMap[entity.name] = added.id
      addedCount++

      for (const attr of entity.attributes) {
        const store = useEntityStore.getState()
        const alreadyHas = store.entities
          .find((e) => e.id === added.id)
          ?.attributes.some((a) => a.columnName === attr.columnName)
        if (!alreadyHas) {
          store.addAttribute(added.id, { ...attr, id: uuidv4() })
        }
      }
    }

    let relCount = 0
    const existingRels = useEntityStore.getState().relationships
    for (const rel of result.relationships) {
      const srcId = entityIdMap[result.entities.find((e) => e.id === rel.sourceEntityId)?.name ?? ''] ?? rel.sourceEntityId
      const tgtId = entityIdMap[result.entities.find((e) => e.id === rel.targetEntityId)?.name ?? ''] ?? rel.targetEntityId
      if (!srcId || !tgtId) continue
      if (existingRels.some((r) => r.sourceEntityId === srcId && r.targetEntityId === tgtId)) continue
      addRelationship({ sourceEntityId: srcId, targetEntityId: tgtId, type: rel.type })
      relCount++
    }

    toast.success(`엔티티 ${addedCount}개, 관계 ${relCount}개를 가져왔습니다.`)
    onClose()
  }

  const modeLabel = mode === 'jpa' ? 'Java JPA' : 'Prisma'
  const accept = mode === 'jpa' ? '.java' : '.prisma,.ts'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full" style={{ maxWidth: '860px', height: '88vh' }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">코드에서 엔티티 가져오기</h2>
            <p className="text-xs text-gray-400 mt-0.5">JPA @Entity 클래스 또는 Prisma schema를 붙여넣거나 파일을 업로드하세요</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4" onClick={onClose}>✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 좌측: 입력 */}
          <div className="flex-1 flex flex-col p-4 border-r border-gray-100 overflow-hidden gap-3">
            {/* 모드 탭 */}
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
              {(['jpa', 'prisma'] as ParseMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setCode(''); setResult(null) }}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    mode === m ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m === 'jpa' ? 'Java JPA' : 'Prisma Schema'}
                </button>
              ))}
            </div>

            {/* 파일 업로드 */}
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept={accept} multiple className="hidden" onChange={handleFileChange} />
              <button
                onClick={() => fileRef.current?.click()}
                className="text-xs border border-dashed border-gray-300 text-gray-500 px-3 py-1.5 rounded-md hover:border-primary-400 hover:text-primary-600 transition-colors"
              >
                {modeLabel} 파일 업로드
              </button>
              <span className="text-xs text-gray-400">또는 아래에 직접 붙여넣기</span>
            </div>

            {/* 코드 입력 */}
            <textarea
              className="flex-1 border border-gray-200 rounded-lg p-3 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 leading-relaxed bg-gray-50"
              placeholder={
                mode === 'jpa'
                  ? `@Entity\n@Table(name = "users")\npublic class User {\n    @Id\n    @GeneratedValue(strategy = GenerationType.IDENTITY)\n    private Long id;\n\n    @Column(nullable = false, unique = true)\n    private String email;\n\n    @OneToMany(mappedBy = "user")\n    private List<Order> orders;\n}`
                  : `model User {\n  id        Int      @id @default(autoincrement())\n  email     String   @unique\n  name      String?\n  posts     Post[]\n  createdAt DateTime @default(now())\n}`
              }
              value={code}
              onChange={(e) => { setCode(e.target.value); setResult(null) }}
            />

            <button
              onClick={handleParse}
              disabled={isLoading || !code.trim()}
              className="bg-primary-600 text-white py-2 rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? '파싱 중...' : '파싱 미리보기'}
            </button>
          </div>

          {/* 우측: 결과 미리보기 */}
          <div className="w-72 flex flex-col p-4 overflow-y-auto gap-3">
            {!result ? (
              <div className="flex-1 flex items-center justify-center text-xs text-gray-300 text-center">
                파싱 미리보기를 실행하면<br />엔티티 목록이 표시됩니다
              </div>
            ) : (
              <>
                {result.warnings.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-yellow-700 mb-1">경고</p>
                    <ul className="space-y-1">
                      {result.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-yellow-600 flex gap-1">
                          <span className="flex-shrink-0">⚠</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.entities.length === 0 ? (
                  <div className="text-xs text-gray-400 text-center py-4">파싱된 엔티티가 없습니다.</div>
                ) : (
                  <>
                    <p className="text-xs font-medium text-gray-500">
                      엔티티 {result.entities.length}개 · 관계 {result.relationships.length}개
                    </p>
                    <div className="space-y-2">
                      {result.entities.map((e) => (
                        <div key={e.id} className="border border-gray-200 rounded-lg overflow-hidden text-xs">
                          <div className="bg-primary-600 text-white px-3 py-1.5 font-medium">
                            {e.name}
                            <span className="ml-2 text-primary-200 font-normal font-mono">{e.tableName}</span>
                          </div>
                          <div className="divide-y divide-gray-50">
                            {e.attributes.map((a) => (
                              <div key={a.id} className="flex items-center px-3 py-1 gap-1.5">
                                <span className={a.isPrimary ? 'text-yellow-500 font-bold' : a.isForeign ? 'text-blue-400' : 'text-gray-300'}>
                                  {a.isPrimary ? 'PK' : a.isForeign ? 'FK' : '  '}
                                </span>
                                <span className="text-gray-700">{a.name}</span>
                                <span className="ml-auto text-gray-400">{a.type}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-between items-center px-6 py-3 border-t border-gray-200 flex-shrink-0">
          <span className="text-xs text-gray-400">
            {result ? `${result.entities.length}개 엔티티가 파싱됨` : '파일을 파싱한 후 가져오기 버튼을 누르세요'}
          </span>
          <div className="flex gap-2">
            <button
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-md text-sm hover:bg-gray-50 transition-colors"
              onClick={onClose}
            >
              취소
            </button>
            <button
              className="bg-primary-600 text-white px-6 py-2 rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={!result || result.entities.length === 0}
              onClick={handleImport}
            >
              가져오기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
