import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { getMembers, inviteMember, removeMember, updateMemberRole, Member } from '../api'
import { useAuthStore } from '../stores/authStore'

interface Props {
  projectId: string
  onClose: () => void
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: '소유자',
  EDITOR: '편집자',
  VIEWER: '뷰어',
}

export default function InviteMemberModal({ projectId, onClose }: Props) {
  const { user } = useAuthStore()
  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('EDITOR')
  const [inviting, setInviting] = useState(false)

  const myRole = members.find((m) => m.userId === user?.userId)?.role

  useEffect(() => {
    getMembers(projectId).then(setMembers).catch(() => toast.error('멤버 조회 실패'))
  }, [projectId])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setInviting(true)
    try {
      const newMember = await inviteMember(projectId, email.trim(), role)
      setMembers((prev) => [...prev, newMember])
      setEmail('')
      toast.success(`${newMember.username}님을 초대했습니다.`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? '초대 실패')
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (targetUserId: number, targetEmail: string) => {
    if (!confirm(`${targetEmail}님을 제거하시겠습니까?`)) return
    try {
      await removeMember(projectId, targetUserId)
      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId))
      toast.success('멤버 제거됨')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? '제거 실패')
    }
  }

  const handleRoleChange = async (targetUserId: number, newRole: string) => {
    try {
      const updated = await updateMemberRole(projectId, targetUserId, newRole)
      setMembers((prev) => prev.map((m) => (m.userId === targetUserId ? updated : m)))
    } catch {
      toast.error('역할 변경 실패')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">멤버 관리</h2>
          <button className="text-gray-400 hover:text-gray-600" onClick={onClose}>✕</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* 현재 멤버 목록 */}
          <div>
            <h3 className="text-sm font-medium text-gray-600 mb-2">현재 멤버 ({members.length})</h3>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <span className="font-medium text-sm text-gray-800">{m.username}</span>
                    <span className="text-xs text-gray-400 ml-2">{m.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {myRole === 'OWNER' && m.role !== 'OWNER' ? (
                      <>
                        <select
                          className="text-xs border border-gray-200 rounded px-1 py-0.5"
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                        >
                          <option value="EDITOR">편집자</option>
                          <option value="VIEWER">뷰어</option>
                        </select>
                        <button
                          className="text-xs text-red-400 hover:text-red-600"
                          onClick={() => handleRemove(m.userId, m.email)}
                        >
                          제거
                        </button>
                      </>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.role === 'OWNER' ? 'bg-yellow-50 text-yellow-600' :
                        m.role === 'EDITOR' ? 'bg-blue-50 text-blue-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 초대 폼 (OWNER만 가능) */}
          {myRole === 'OWNER' && (
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-2">멤버 초대</h3>
              <form onSubmit={handleInvite} className="flex gap-2">
                <input
                  type="email"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="초대할 이메일 주소"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <select
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="EDITOR">편집자</option>
                  <option value="VIEWER">뷰어</option>
                </select>
                <button
                  type="submit"
                  disabled={inviting}
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                >
                  {inviting ? '...' : '초대'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
