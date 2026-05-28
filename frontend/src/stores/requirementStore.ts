import { create } from 'zustand'

interface RequirementState {
  text: string
  isAnalyzing: boolean
  error: string | null
  setText: (text: string) => void
  setAnalyzing: (v: boolean) => void
  setError: (e: string | null) => void
}

export const useRequirementStore = create<RequirementState>((set) => ({
  text: '',
  isAnalyzing: false,
  error: null,
  setText: (text) => set({ text }),
  setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setError: (error) => set({ error }),
}))
