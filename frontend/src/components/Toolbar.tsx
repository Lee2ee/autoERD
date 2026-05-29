import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useEntityStore } from '../stores/entityStore'
import { useProjectStore } from '../stores/projectStore'
import { useRequirementStore } from '../stores/requirementStore'
import { useAuthStore } from '../stores/authStore'
import { saveProject, updateProject } from '../api'
import InviteMemberModal from './InviteMemberModal'

export default function Toolbar() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { entities, relationships, businessRules, setEntities, setRelationships, setBusinessRules, reset } = useEntityStore()
  const { id: storedId, name, myRole, setProject, setName, setSavedAt } = useProjectStore()
  const { text: requirementText, setText } = useRequirementStore()
  const { user, logout } = useAuthStore()
  const [showInvite, setShowInvite] = useState(false)

  const canEdit = !myRole || myRole === 'OWNER' || myRole === 'EDITOR'

  const handleSave = useCallback(async () => {
    if (!canEdit) { toast.error('편집 권한이 없습니다.'); return }
    try {
      const pid = projectId || storedId
      if (pid) {
        const updated = await updateProject(pid, { entities, relationships, businessRules, requirement: requirementText })
        setSavedAt(updated.updatedAt)
        toast.success('저장 완료')
      } else {
        const created = await saveProject({ name, entities, relationships, businessRules, requirement: requirementText })
        setProject(created.id, created.name)
        setSavedAt(created.createdAt)
        toast.success('프로젝트 저장됨')
      }
    } catch {
      toast.error('저장 실패')
    }
  }, [projectId, storedId, name, entities, relationships, businessRules, requirementText, canEdit])

  const handleExport = useCallback(() => {
    const data = { name, requirementText, entities, relationships, businessRules, exportedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('JSON 내보내기 완료')
  }, [name, requirementText, entities, relationships, businessRules])

  const handleReset = useCallback(() => {
    if (entities.length === 0 && !requirementText.trim()) { toast.error('초기화할 내용이 없습니다.'); return }
    if (!window.confirm(`엔티티 ${entities.length}개, 관계, 업무 규칙 및 요구사항이 모두 삭제됩니다.\n계속하시겠습니까?`)) return
    reset()
    setText('')
    toast.success('프로젝트가 초기화되었습니다.')
  }, [entities.length, requirementText, reset, setText])

  const handleImport = useCallback(() => {
    if (!canEdit) { toast.error('편집 권한이 없습니다.'); return }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string)
          setEntities(data.entities ?? [])
          setRelationships(data.relationships ?? [])
          setBusinessRules(data.businessRules ?? [])
          if (data.name) setName(data.name)
          if (data.requirementText !== undefined) setText(data.requirementText)
          toast.success('가져오기 완료')
        } catch {
          toast.error('JSON 파일 형식이 올바르지 않습니다.')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [canEdit])

  return (
    <>
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            className="text-gray-400 hover:text-gray-600 text-sm"
            onClick={() => navigate('/projects')}
          >
            ←
          </button>
          <span className="text-primary-600 font-bold">AutoERD</span>
          <input
            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="프로젝트 이름"
            disabled={!canEdit}
          />
          {myRole && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              myRole === 'OWNER' ? 'bg-yellow-50 text-yellow-600' :
              myRole === 'EDITOR' ? 'bg-blue-50 text-blue-600' :
              'bg-gray-100 text-gray-500'
            }`}>
              {myRole}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{user?.username}</span>
          {(projectId || storedId) && myRole === 'OWNER' && (
            <button
              className="text-sm text-gray-600 border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
              onClick={() => setShowInvite(true)}
            >
              멤버 초대
            </button>
          )}
          {canEdit && (
            <button
              className="text-sm text-red-500 border border-red-200 px-3 py-1 rounded hover:bg-red-50 hover:border-red-400 transition-colors"
              onClick={handleReset}
            >
              초기화
            </button>
          )}
          <button
            className="text-sm text-gray-600 border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
            onClick={handleImport}
          >
            가져오기
          </button>
          <button
            className="text-sm text-gray-600 border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
            onClick={handleExport}
          >
            내보내기
          </button>
          {canEdit && (
            <button
              className="text-sm bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700"
              onClick={handleSave}
            >
              저장
            </button>
          )}
          <button
            className="text-sm text-gray-500 border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
            onClick={() => { logout(); navigate('/login') }}
          >
            로그아웃
          </button>
        </div>
      </header>

      {showInvite && (projectId || storedId) && (
        <InviteMemberModal
          projectId={(projectId || storedId)!}
          onClose={() => setShowInvite(false)}
        />
      )}
    </>
  )
}
