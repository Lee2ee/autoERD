import axios from 'axios'
import { Project, AnalysisResult, NormalFormLevel, NormalizeResult } from '../types'
import { useAuthStore } from '../stores/authStore'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
})

// JWT 자동 첨부
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 → 로그아웃
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ─── Auth ────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string
  userId: number
  email: string
  username: string
  role: string
}

export const login = (email: string, password: string): Promise<AuthResponse> =>
  api.post('/auth/login', { email, password }).then((r) => r.data)

export const register = (email: string, username: string, password: string): Promise<AuthResponse> =>
  api.post('/auth/register', { email, username, password }).then((r) => r.data)

export const getMe = (): Promise<AuthResponse> =>
  api.get('/auth/me').then((r) => r.data)

// ─── Projects ────────────────────────────────────────────────────

export const analyzeRequirement = (text: string): Promise<AnalysisResult> =>
  api.post('/ai/analyze', { text }).then((r) => r.data)

export const normalizeEntities = (
  entities: Array<{ name: string; attributes: string[] }>,
  level: NormalFormLevel,
): Promise<NormalizeResult> =>
  api.post('/ai/normalize', { entities, level }).then((r) => r.data)

export const saveProject = (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> =>
  api.post('/projects', project).then((r) => r.data)

export const updateProject = (id: string, project: Partial<Project>): Promise<Project> =>
  api.put(`/projects/${id}`, project).then((r) => r.data)

export const getProject = (id: string): Promise<Project> =>
  api.get(`/projects/${id}`).then((r) => r.data)

export const listProjects = (): Promise<Project[]> =>
  api.get('/projects').then((r) => r.data)

export const deleteProject = (id: string): Promise<void> =>
  api.delete(`/projects/${id}`).then(() => undefined)

export const generateSql = (projectId: string): Promise<string> =>
  api.get(`/projects/${projectId}/sql`).then((r) => r.data.sql)

// ─── Members ─────────────────────────────────────────────────────

export interface Member {
  userId: number
  email: string
  username: string
  role: string
  joinedAt: string
}

export const getMembers = (projectId: string): Promise<Member[]> =>
  api.get(`/projects/${projectId}/members`).then((r) => r.data)

export const inviteMember = (projectId: string, email: string, role: string): Promise<Member> =>
  api.post(`/projects/${projectId}/members`, { email, role }).then((r) => r.data)

export const updateMemberRole = (projectId: string, userId: number, role: string): Promise<Member> =>
  api.put(`/projects/${projectId}/members/${userId}`, { role }).then((r) => r.data)

export const removeMember = (projectId: string, userId: number): Promise<void> =>
  api.delete(`/projects/${projectId}/members/${userId}`).then(() => undefined)

// ─── API Keys ────────────────────────────────────────────────────

export interface ApiKeyEntry {
  id: number
  provider: string
  model: string | null
}

export const listApiKeys = (): Promise<ApiKeyEntry[]> =>
  api.get('/users/me/api-keys').then((r) => r.data)

export const saveApiKey = (provider: string, apiKey: string, model?: string): Promise<ApiKeyEntry> =>
  api.put('/users/me/api-keys', { provider, apiKey, model }).then((r) => r.data)

export const deleteApiKey = (provider: string): Promise<void> =>
  api.delete(`/users/me/api-keys/${provider}`).then(() => undefined)
