import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { RateLimitInfo } from '../types'

interface RequirementState {
  text: string
  isAnalyzing: boolean
  error: string | null
  rateLimit: RateLimitInfo | null
  setText: (text: string) => void
  setAnalyzing: (v: boolean) => void
  setError: (e: string | null) => void
  setRateLimit: (info: RateLimitInfo | null) => void
}

export const useRequirementStore = create<RequirementState>()(
  persist(
    (set) => ({
      text: '',
      isAnalyzing: false,
      error: null,
      rateLimit: null,
      setText: (text) => set({ text }),
      setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
      setError: (error) => set({ error }),
      setRateLimit: (rateLimit) => set({ rateLimit }),
    }),
    {
      name: 'autoerd-requirement',
      partialize: (state) => ({ rateLimit: state.rateLimit }),
    }
  )
)
