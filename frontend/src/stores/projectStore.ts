import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ProjectState {
  id: string | null
  name: string
  myRole: string | null
  savedAt: string | null
  setProject: (id: string, name: string, role?: string) => void
  setName: (name: string) => void
  setMyRole: (role: string) => void
  setSavedAt: (at: string) => void
  newProject: () => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      id: null,
      name: '새 프로젝트',
      myRole: null,
      savedAt: null,
      setProject: (id, name, role) => set({ id, name, myRole: role ?? null }),
      setName: (name) => set({ name }),
      setMyRole: (myRole) => set({ myRole }),
      setSavedAt: (savedAt) => set({ savedAt }),
      newProject: () => set({ id: null, name: '새 프로젝트', myRole: null, savedAt: null }),
    }),
    { name: 'autoerd-project' }
  )
)
