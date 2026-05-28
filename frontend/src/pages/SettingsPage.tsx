import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { listApiKeys, saveApiKey, deleteApiKey, ApiKeyEntry } from '../api'
import { useAuthStore } from '../stores/authStore'

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama3-70b-8192',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
]

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [keys, setKeys] = useState<ApiKeyEntry[]>([])
  const [form, setForm] = useState({ provider: 'groq', apiKey: '', model: GROQ_MODELS[0] })
  const [saving, setSaving] = useState(false)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    listApiKeys().then(setKeys).catch(() => toast.error('API 키 조회 실패'))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.apiKey.trim()) {
      toast.error('API 키를 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      const saved = await saveApiKey(form.provider, form.apiKey, form.model)
      setKeys((prev) => {
        const idx = prev.findIndex((k) => k.provider === saved.provider)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = saved
          return next
        }
        return [...prev, saved]
      })
      setForm((f) => ({ ...f, apiKey: '' }))
      toast.success('API 키 저장 완료 (암호화하여 저장됨)')
    } catch {
      toast.error('저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (provider: string) => {
    if (!confirm(`${provider} API 키를 삭제하시겠습니까?`)) return
    try {
      await deleteApiKey(provider)
      setKeys((prev) => prev.filter((k) => k.provider !== provider))
      toast.success('삭제됨')
    } catch {
      toast.error('삭제 실패')
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            className="text-gray-400 hover:text-gray-600 text-sm"
            onClick={() => navigate('/projects')}
          >
            ← 프로젝트 목록
          </button>
          <span className="text-primary-600 font-bold">설정</span>
        </div>
        <span className="text-sm text-gray-600">{user?.username}</span>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* 계정 정보 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-semibold text-gray-800 mb-4">계정 정보</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">이메일</span>
              <span className="text-gray-800">{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">사용자명</span>
              <span className="text-gray-800">{user?.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">역할</span>
              <span className="text-primary-600 font-medium">{user?.role}</span>
            </div>
          </div>
        </div>

        {/* AI API 키 관리 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-semibold text-gray-800 mb-1">AI API 키 관리</h2>
          <p className="text-xs text-gray-400 mb-4">
            API 키는 AES-256-GCM으로 암호화되어 저장됩니다. 저장 후 키 값은 다시 조회할 수 없습니다.
          </p>

          {/* 등록된 키 목록 */}
          {keys.length > 0 && (
            <div className="mb-4 space-y-2">
              {keys.map((k) => (
                <div key={k.provider} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
                  <div>
                    <span className="font-medium text-sm text-gray-700 capitalize">{k.provider}</span>
                    {k.model && (
                      <span className="ml-2 text-xs text-gray-400 font-mono">{k.model}</span>
                    )}
                    <span className="ml-2 text-xs text-green-600">등록됨</span>
                  </div>
                  <button
                    className="text-red-400 hover:text-red-600 text-xs"
                    onClick={() => handleDelete(k.provider)}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 새 키 등록 폼 */}
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              >
                <option value="groq">Groq</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">모델</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              >
                {GROQ_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API 키</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 pr-16"
                  placeholder="gsk_xxxxxxxxxxxx"
                  value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? '숨김' : '표시'}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-primary-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '저장 중...' : 'API 키 저장'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
