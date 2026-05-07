import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useStore, readStore, writeStore } from './store'
import { localDate } from './date-utils'

// ─── Types ───────────────────────────────────────────────

export interface SprintSession {
  id: string
  task: string
  duration: number       // minutes
  startedAt: string      // ISO
  completedAt: string    // ISO
}

interface PersistedSprint {
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

const SprintContext = createContext<SprintContextValue | null>(null)

export function useSprintTimer() {
  const ctx = useContext(SprintContext)
  if (!ctx) throw new Error('useSprintTimer must be used within SprintProvider')
  return ctx
}

// ─── Tray sync helper ────────────────────────────────────

function syncTray(sprint: PersistedSprint | null) {
  if (!window.electronAPI?.tray?.sprintSync) return
  if (sprint && !sprint.isPaused) {
    window.electronAPI.tray.sprintSync({ active: true, endTimeMs: sprint.endTimeMs, task: sprint.task })
  } else {
    window.electronAPI.tray.sprintSync({ active: false })
  }
}

// ─── Provider ────────────────────────────────────────────

export function SprintProvider({ children }: { children: ReactNode }) {
  const today = localDate()
  const [sessions, updateSessions] = useStore<SprintSession[]>(`cortex-daily-sessions-${today}`, [])

  const [sprint, setSprintState] = useState<PersistedSprint | null>(null)
  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const [task, setTask] = useState('')
  const [duration, setDurationVal] = useState(25)

  const sprintRef = useRef<PersistedSprint | null>(null)
  const durationRef = useRef(25)
  const taskRef = useRef('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const initRef = useRef(false)
  const lastWriteRef = useRef(0) // timestamp of last local write (skip remote polls during cooldown)

  // Keep refs in sync
  sprintRef.current = sprint
  durationRef.current = duration
  taskRef.current = task

  // Central commit: updates ref + state + store + tray
  const commitSprint = useCallback((s: PersistedSprint | null) => {
    sprintRef.current = s
    setSprintState(s)
    lastWriteRef.current = Date.now()
    writeStore('cortex-active-sprint', s)
    syncTray(s)
  }, [])

  // ─── Load persisted sprint on mount ────────────────────
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    readStore<PersistedSprint | null>('cortex-active-sprint', null).then((saved) => {
      if (!saved) return
      setTask(saved.task)
      setDurationVal(saved.duration)
      durationRef.current = saved.duration

      if (saved.isPaused) {
        setTimeLeft(saved.pausedTimeLeft)
        sprintRef.current = saved
        setSprintState(saved)
        syncTray(saved)
      } else {
        const remaining = Math.max(0, Math.round((saved.endTimeMs - Date.now()) / 1000))
        if (remaining <= 0) {
          // Completed while app was closed — save session
          updateSessions((prev) => [...prev, {
            id: Date.now().toString(),
            task: saved.task || 'Untitled session',
            duration: saved.duration,
            startedAt: saved.startedAt,
            completedAt: new Date(saved.endTimeMs).toISOString(),
          }])
          writeStore('cortex-active-sprint', null)
          syncTray(null)
          setTimeLeft(saved.duration * 60)
        } else {
          setTimeLeft(remaining)
          sprintRef.current = saved
          setSprintState(saved)
          syncTray(saved)
        }
      }
    })
  }, [])

  // ─── Cross-device sync (poll for remote changes) ───────
  useEffect(() => {
    const COOLDOWN = 3000
    const poll = () => {
      if (Date.now() - lastWriteRef.current < COOLDOWN) return
      readStore<PersistedSprint | null>('cortex-active-sprint', null).then((remote) => {
        if (Date.now() - lastWriteRef.current < COOLDOWN) return
        const local = sprintRef.current
        const remoteJson = JSON.stringify(remote)
        const localJson = JSON.stringify(local)
        if (remoteJson === localJson) return

        // Remote state changed — apply it
        if (!remote) {
          sprintRef.current = null
          setSprintState(null)
          setTimeLeft(durationRef.current * 60)
          syncTray(null)
        } else {
          setTask(remote.task)
          setDurationVal(remote.duration)
          durationRef.current = remote.duration
          sprintRef.current = remote
          setSprintState(remote)
          if (remote.isPaused) {
            setTimeLeft(remote.pausedTimeLeft)
          } else {
            setTimeLeft(Math.max(0, Math.round((remote.endTimeMs - Date.now()) / 1000)))
          }
          syncTray(remote)
        }
      })
    }
    const id = setInterval(poll, 2000)
    const onVis = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // ─── Timer tick ────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (!sprint || sprint.isPaused) return

    const tick = () => {
      const s = sprintRef.current
      if (!s || s.isPaused) return
      const remaining = Math.max(0, Math.round((s.endTimeMs - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0) {
        updateSessions((prev) => [...prev, {
          id: Date.now().toString(),
          task: s.task || 'Untitled session',
          duration: s.duration,
          startedAt: s.startedAt,
          completedAt: new Date().toISOString(),
        }])
        commitSprint(null)
        setTimeLeft(durationRef.current * 60)
      }
    }

    tick()
    intervalRef.current = setInterval(tick, 1000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [sprint?.endTimeMs, sprint?.isPaused])

  // ─── Listen for tray actions (start/stop from menu bar) ─
  useEffect(() => {
    if (!window.electronAPI?.onSprintAction) return
    window.electronAPI.onSprintAction((action: string, data?: { duration?: number }) => {
      if (action === 'start' && !sprintRef.current) {
        const dur = data?.duration || 60
        setDurationVal(dur)
        durationRef.current = dur
        setTask('Sprint Session')
        taskRef.current = 'Sprint Session'
        const now = new Date()
        const state: PersistedSprint = {
          task: 'Sprint Session',
          startedAt: now.toISOString(),
          endTimeMs: now.getTime() + dur * 60 * 1000,
          duration: dur,
          isPaused: false,
          pausedTimeLeft: 0,
        }
        setTimeLeft(dur * 60)
        sprintRef.current = state
        setSprintState(state)
        lastWriteRef.current = Date.now()
        writeStore('cortex-active-sprint', state)
        syncTray(state)
      } else if (action === 'stop') {
        const s = sprintRef.current
        if (s && !s.isPaused) {
          const elapsedMin = Math.round((Date.now() - new Date(s.startedAt).getTime()) / 60000)
          if (elapsedMin >= 1) {
            updateSessions((prev) => [...prev, {
              id: Date.now().toString(),
              task: s.task || 'Untitled session',
              duration: elapsedMin,
              startedAt: s.startedAt,
              completedAt: new Date().toISOString(),
            }])
          }
        }
        sprintRef.current = null
        setSprintState(null)
        setTimeLeft(durationRef.current * 60)
        lastWriteRef.current = Date.now()
        writeStore('cortex-active-sprint', null)
        syncTray(null)
      }
    })
  }, [])

  // ─── Actions ───────────────────────────────────────────

  const start = useCallback(() => {
    const now = new Date()
    const dur = durationRef.current
    const state: PersistedSprint = {
      task: taskRef.current,
      startedAt: now.toISOString(),
      endTimeMs: now.getTime() + dur * 60 * 1000,
      duration: dur,
      isPaused: false,
      pausedTimeLeft: 0,
    }
    setTimeLeft(dur * 60)
    commitSprint(state)
  }, [commitSprint])

  const pause = useCallback(() => {
    const s = sprintRef.current
    if (!s) return
    const remaining = Math.max(0, Math.round((s.endTimeMs - Date.now()) / 1000))
    setTimeLeft(remaining)
    commitSprint({ ...s, isPaused: true, pausedTimeLeft: remaining })
  }, [commitSprint])

  const resume = useCallback(() => {
    const s = sprintRef.current
    if (!s) return
    commitSprint({
      ...s,
      task: taskRef.current || s.task,
      endTimeMs: Date.now() + s.pausedTimeLeft * 1000,
      isPaused: false,
    })
  }, [commitSprint])

  const reset = useCallback(() => {
    const s = sprintRef.current
    if (s && !s.isPaused) {
      const elapsedMin = Math.round((Date.now() - new Date(s.startedAt).getTime()) / 60000)
      if (elapsedMin >= 1) {
        updateSessions((prev) => [...prev, {
          id: Date.now().toString(),
          task: s.task || 'Untitled session',
          duration: elapsedMin,
          startedAt: s.startedAt,
          completedAt: new Date().toISOString(),
        }])
      }
    }
    commitSprint(null)
    setTimeLeft(durationRef.current * 60)
  }, [commitSprint, updateSessions])

  const setDuration = useCallback((m: number) => {
    setDurationVal(m)
    durationRef.current = m
    if (!sprintRef.current) setTimeLeft(m * 60)
  }, [])

  const sessionCount = sessions.length
  const totalDeepWorkMin = sessions.reduce((sum, s) => sum + s.duration, 0)

  return (
    <SprintContext.Provider value={{
      isRunning: !!sprint && !sprint.isPaused,
      isPaused: !!sprint?.isPaused,
      timeLeft,
      task,
      duration,
      sessions,
      sessionCount,
      totalDeepWorkMin,
      setTask,
      setDuration,
      start,
      pause,
      resume,
      reset,
    }}>
      {children}
    </SprintContext.Provider>
  )
}
