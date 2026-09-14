import { createContext, useContext } from 'react'

// ─── Types ───────────────────────────────────────────────

export interface SprintSession {
  id: string
  task: string
  duration: number       // minutes
  startedAt: string      // ISO
  completedAt: string    // ISO
}

export interface PersistedSprint {
  task: string
  startedAt: string      // ISO — when the sprint was first started
  endTimeMs: number       // absolute timestamp when timer reaches 0
  duration: number        // original duration in minutes
  isPaused: boolean
  pausedTimeLeft: number  // seconds remaining when paused
}

interface SprintContextValue {
  isRunning: boolean
  isPaused: boolean
  timeLeft: number        // seconds
  task: string
  duration: number        // minutes
  sessions: SprintSession[]
  sessionCount: number
  totalDeepWorkMin: number
  setTask: (task: string) => void
  setDuration: (minutes: number) => void
  start: () => void
  pause: () => void
  resume: () => void
  reset: () => void
}

// ─── Context ─────────────────────────────────────────────

export const SprintContext = createContext<SprintContextValue | null>(null)

export function useSprintTimer() {
  const ctx = useContext(SprintContext)
  if (!ctx) throw new Error('useSprintTimer must be used within SprintProvider')
  return ctx
}

