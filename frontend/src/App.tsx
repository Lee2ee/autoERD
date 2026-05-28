import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './stores/authStore'
import { useProjectStore } from './stores/projectStore'
import { useEntityStore } from './stores/entityStore'
import { getProject } from './api'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProjectListPage from './pages/ProjectListPage'
import SettingsPage from './pages/SettingsPage'
import Toolbar from './components/Toolbar'
import RequirementInput from './components/RequirementInput'
import EntityTable from './components/EntityTable'
import RelationshipPanel from './components/RelationshipPanel'
import ERDCanvas from './components/ERDCanvas'
import SqlPreview from './components/SqlPreview'

type Tab = 'entities' | 'erd' | 'sql'

// ERD 편집기 (프로젝트 로드 포함)
function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('entities')
  const [loading, setLoading] = useState(!!id)
  const { setProject } = useProjectStore()
  const { setEntities, setRelationships } = useEntityStore()

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getProject(id)
      .then((p) => {
        setProject(p.id, p.name, (p as { myRole?: string }).myRole)
        setEntities(p.entities ?? [])
        setRelationships(p.relationships ?? [])
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
        <div className="w-80 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
          <RequirementInput />
          <RelationshipPanel />
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
