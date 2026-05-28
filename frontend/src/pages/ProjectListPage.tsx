import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { listProjects, saveProject, deleteProject } from '../api'
import { useAuthStore } from '../stores/authStore'
import { Project } from '../types'

export default function ProjectListPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [projects, setProjects] = useState<(Project & { myRole?: string; memberCount?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const load = async () => {
    try {
      const data = await listProjects()
      setProjects(data as (Project & { myRole?: string; memberCount?: number })[])
    } catch {
      toast.error('프로젝트 목록 로드 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      const created = await saveProject({
        name: newName.trim(),
        entities: [],
        relationships: [],
      })
      setCreating(false)
      setNewName('')
      navigate(`/projects/${created.id}`)
    } catch {
      toast.error('프로젝트 생성 실패')
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('프로젝트를 삭제하시겠습니까?')) return
    try {
      await deleteProject(id)
      setProjects((p) => p.filter((x) => x.id !== id))
    } catch {
      toast.error('삭제 실패')
    }
  }

  const roleColor = (role?: string) => {
    if (role === 'OWNER') return 'text-yellow-600 bg-yellow-50'
    if (role === 'EDITOR') return 'text-blue-600 bg-blue-50'
    return 'text-gray-500 bg-gray-50'
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <span className="text-primary-600 font-bold text-lg">AutoERD</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user?.username}</span>
          <button
            className="text-sm text-gray-500 border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
            onClick={() => navigate('/settings')}
          >
            설정
          </button>
          <button
            className="text-sm text-gray-500 border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
            onClick={() => { logout(); navigate('/login') }}
          >
            로그아웃
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">내 프로젝트</h2>
          <button
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            onClick={() => setCreating(true)}
          >
            + 새 프로젝트
          </button>
        </div>

        {/* 새 프로젝트 생성 인라인 폼 */}
        {creating && (
          <div className="bg-white rounded-lg shadow p-4 mb-4 flex gap-2 items-center">
            <input
              autoFocus
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="프로젝트 이름"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            />
            <button
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700"
              onClick={handleCreate}
            >
              생성
            </button>
            <button
              className="text-gray-500 border border-gray-300 px-3 py-2 rounded-lg text-sm hover:bg-gray-50"
              onClick={() => setCreating(false)}
            >
              취소
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-400">불러오는 중...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">프로젝트가 없습니다.</p>
            <p className="text-sm">새 프로젝트를 만들어 시작하세요.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {projects.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-lg shadow px-5 py-4 cursor-pointer hover:shadow-md transition-shadow flex items-center justify-between"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{p.name}</span>
                    {p.myRole && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(p.myRole)}`}>
                        {p.myRole}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {p.memberCount != null && `멤버 ${p.memberCount}명 · `}
                    엔티티 {(p as { entities?: unknown[] }).entities?.length ?? 0}개
                    {p.updatedAt && ` · ${new Date(p.updatedAt).toLocaleDateString('ko-KR')}`}
                  </div>
                </div>
                {p.myRole === 'OWNER' && (
                  <button
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
                    onClick={(e) => handleDelete(p.id, e)}
                  >
                    삭제
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
