import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { login } from '../api'
import { useAuthStore } from '../stores/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await login(email, password)
      setAuth(res.token, {
        userId: res.userId,
        email: res.email,
        username: res.username,
        role: res.role,
      })
      navigate('/projects')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? '로그인 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-primary-600 mb-1">AutoERD</h1>
        <p className="text-gray-500 text-sm mb-6">AI 기반 DB 모델링 플랫폼</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white py-2 rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2 font-medium">테스트 계정</p>
          <div className="space-y-1">
            {[
              ['admin@autoerd.com', 'admin123', 'ADMIN'],
              ['alice@autoerd.com', 'password123', 'USER'],
              ['bob@autoerd.com', 'password123', 'USER'],
            ].map(([e, p, role]) => (
              <button
                key={e}
                type="button"
                className="w-full text-left text-xs text-gray-500 bg-gray-50 hover:bg-gray-100 rounded px-3 py-1.5 transition-colors"
                onClick={() => { setEmail(e); setPassword(p) }}
              >
                <span className="font-mono">{e}</span>
                <span className="ml-2 text-gray-400">/ {p}</span>
                <span className="ml-2 text-primary-500 font-medium">[{role}]</span>
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          계정이 없으신가요?{' '}
          <Link to="/register" className="text-primary-600 font-medium hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  )
}
