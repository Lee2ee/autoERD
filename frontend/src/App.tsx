import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './stores/authStore'
import { useProjectStore } from './stores/projectStore'
import { useEntityStore } from './stores/entityStore'
import { useRequirementStore } from './stores/requirementStore'
import { getProject } from './api'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProjectListPage from './pages/ProjectListPage'
import SettingsPage from './pages/SettingsPage'
import Toolbar from './components/Toolbar'
import RequirementInput from './components/RequirementInput'
import EntityTable from './components/EntityTable'
import RelationshipPanel from './components/RelationshipPanel'
import BusinessRulePanel from './components/BusinessRulePanel'
import NormalizationPanel from './components/NormalizationPanel'
import ERDCanvas from './components/ERDCanvas'
import SqlPreview from './components/SqlPreview'

type Tab = 'entities' | 'erd' | 'sql'
type SideTab = 'requirement' | 'normalize' | 'relationship' | 'rules'

// ERD 편집기 (프로젝트 로드 포함)
function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('entities')
  const [sideTab, setSideTab] = useState<SideTab>('requirement')
  const [loading, setLoading] = useState(!!id)
  const { relationships, businessRules } = useEntityStore()
  const { setProject } = useProjectStore()
  const { setEntities, setRelationships, setBusinessRules } = useEntityStore()
  const { setText } = useRequirementStore()

  // 플러그인에서 #import=<base64url> 해시로 엔티티 가져오기
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.startsWith('#import=')) return
    try {
      const encoded = hash.slice('#import='.length).replace(/-/g, '+').replace(/_/g, '/')
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
      const json = new TextDecoder().decode(bytes)
      const data = JSON.parse(json)
      if (data.entities) setEntities(data.entities)
      if (data.relationships) setRelationships(data.relationships)
      history.replaceState(null, '', window.location.pathname)
    } catch (e) {
      console.error('AutoERD import 실패:', e)
    }
  }, [])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getProject(id)
      .then((p) => {
        setProject(p.id, p.name, (p as { myRole?: string }).myRole)
        setEntities(p.entities ?? [])
        setRelationships(p.relationships ?? [])
        setBusinessRules(p.businessRules ?? [])
        setText(p.requirement ?? '')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-400">
        로딩 중...
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      <Toolbar />
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* 사이드바 */}
        <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden">
          {/* 탭 바 */}
          <div className="flex bg-white rounded-lg shadow mb-2 p-1 gap-0.5 flex-shrink-0">
            {(
              [
                { key: 'requirement', label: '요구사항' },
                { key: 'normalize',   label: '정규화' },
                { key: 'relationship', label: '관계', badge: relationships.length || undefined },
                { key: 'rules',       label: '업무규칙', badge: businessRules.length || undefined },
              ] as { key: SideTab; label: string; badge?: number }[]
            ).map(({ key, label, badge }) => (
              <button
                key={key}
                onClick={() => setSideTab(key)}
                className={`flex-1 relative py-1.5 rounded-md text-xs font-medium transition-colors ${
                  sideTab === key
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {label}
                {badge != null && (
                  <span className={`absolute -top-1 -right-1 text-[10px] font-bold rounded-full px-1 leading-4 ${
                    sideTab === key ? 'bg-white text-primary-600' : 'bg-primary-100 text-primary-600'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* 탭 콘텐츠 */}
          <div className="flex-1 overflow-y-auto">
            {sideTab === 'requirement'  && <RequirementInput />}
            {sideTab === 'normalize'    && <NormalizationPanel />}
            {sideTab === 'relationship' && <RelationshipPanel />}
            {sideTab === 'rules'        && <BusinessRulePanel />}
          </div>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex gap-1 mb-3">
            {([['entities', '엔티티 편집'], ['erd', 'ERD 다이어그램'], ['sql', 'SQL DDL']] as [Tab, string][]).map(
              ([key, label]) => (
                <button
                  key={key}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === key
                      ? 'bg-white text-primary-600 shadow'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                  }`}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              )
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            {tab === 'entities' && (
              <div className="h-full overflow-y-auto">
                <EntityTable />
              </div>
            )}
            {tab === 'erd' && (
              <div className="h-full bg-white rounded-lg shadow overflow-hidden">
                <ERDCanvas />
              </div>
            )}
            {tab === 'sql' && (
              <div className="h-full">
                <SqlPreview />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/projects" element={<PrivateRoute><ProjectListPage /></PrivateRoute>} />
        <Route path="/projects/new" element={<PrivateRoute><EditorPage /></PrivateRoute>} />
        <Route path="/projects/:id" element={<PrivateRoute><EditorPage /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
