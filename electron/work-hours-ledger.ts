import { type ActiveWork, type WorkHoursCommand, type WorkHoursState, type WorkSession, type WorkSessionValues, iso, id, project, currentValues } from './work-hours-types.js'
import { createWorkHoursReport } from './work-hours-report.js'

function completed(active: ActiveWork, endedAt: string, needsReview = false): WorkSession {
  const durationMs = Date.parse(endedAt) - Date.parse(active.startedAt)
  if (durationMs < 0) throw new Error('Stop time precedes start time')
  return {
    id: active.id,
    projectId: active.projectId,
    startedAt: active.startedAt,
    endedAt,
    durationMs,
    description: '',
    billable: true,
    prUrl: null,
    needsReview,
    corrections: [],
  }
}

function availableSessionId(state: WorkHoursState, value: string): string {
  const sessionId = id(value)
  if (state.active?.id === sessionId || state.sessions.some((entry) => entry.id === sessionId)) {
    throw new Error('Session ID already exists')
  }
  return sessionId
}

function validPrUrl(value: string | null): string | null {
  if (value === null) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:') throw new Error('Invalid PR URL')
    return parsed.toString()
  } catch {
    throw new Error('Invalid PR URL')
  }
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && end > otherStart
}

export function applyWorkHoursCommand(state: WorkHoursState, command: WorkHoursCommand, now: string): WorkHoursState {
  const at = iso(now)
  switch (command.type) {
    case 'add-project': {
      const projectId = id(command.id)
      const name = command.name.trim()
      if (!name) throw new Error('Project name is required')
      if (state.projects.some((entry) => entry.id === projectId)) throw new Error('Project ID already exists')
      return { ...state, projects: [...state.projects, { id: projectId, name, ratePerHour: null, currency: 'COP' }] }
    }
    case 'start': {
      project(state, command.projectId)
      if (state.active) throw new Error('Work is already active; use Switch or Stop')
      const sessionId = availableSessionId(state, command.id)
      if (state.sessions.some((entry) => Date.parse(entry.endedAt) > Date.parse(at))) throw new Error('Start time overlaps a saved session')
      return {
        ...state,
        active: { id: sessionId, projectId: command.projectId, startedAt: at, interrupted: false },
      }
    }
    case 'switch': {
      const active = state.active
      if (!active) throw new Error('No active work to switch')
      project(state, command.projectId)
      if (active.projectId === command.projectId) throw new Error('Switch requires a different project')
      const sessionId = availableSessionId(state, command.id)
      return {
        ...state,
        active: { id: sessionId, projectId: command.projectId, startedAt: at, interrupted: false },
        sessions: [...state.sessions, completed(active, at, active.interrupted)],
      }
    }
    case 'stop':
      if (!state.active) return state
      return { ...state, active: null, sessions: [...state.sessions, completed(state.active, at, state.active.interrupted)] }
    case 'set-rate': {
      project(state, command.projectId)
      const rate = command.ratePerHour
      if (rate !== null && (!Number.isFinite(rate) || rate < 0)) throw new Error('Invalid hourly rate')
      return {
        ...state,
        projects: state.projects.map((entry) => entry.id === command.projectId ? { ...entry, ratePerHour: rate } : entry),
      }
    }
    case 'correct-session': {
      const row = state.sessions.find((entry) => entry.id === command.sessionId)
      if (!row) throw new Error('Session not found')
      const startedAt = iso(command.startedAt)
      const endedAt = iso(command.endedAt)
      const startMs = Date.parse(startedAt)
      const endMs = Date.parse(endedAt)
      if (endMs <= startMs) throw new Error('Session end must be after start')
      if (endMs > Date.parse(at)) throw new Error('Session end cannot be in the future')
      if (typeof command.description !== 'string' || typeof command.billable !== 'boolean') throw new Error('Invalid session correction')
      const after: WorkSessionValues = {
        startedAt,
        endedAt,
        description: command.description.trim(),
        billable: command.billable,
        prUrl: validPrUrl(command.prUrl),
      }
      if (state.sessions.some((other) => other.id !== row.id && overlaps(startMs, endMs, Date.parse(other.startedAt), Date.parse(other.endedAt)))) {
        throw new Error('Corrected session overlaps another session')
      }
      if (state.active && overlaps(startMs, endMs, Date.parse(state.active.startedAt), Date.parse(at))) {
        throw new Error('Corrected session overlaps active work')
      }
      const before = currentValues(row)
      if (JSON.stringify(before) === JSON.stringify(after)) return state
      return {
        ...state,
        sessions: state.sessions.map((entry) => entry.id === row.id ? {
          ...entry,
          ...after,
          durationMs: endMs - startMs,
          corrections: [...entry.corrections, { correctedAt: at, before, after }],
        } : entry),
      }
    }
    case 'review-session': {
      const row = state.sessions.find((entry) => entry.id === command.sessionId)
      if (!row) throw new Error('Session not found')
      if (!row.needsReview) return state
      return { ...state, sessions: state.sessions.map((entry) => entry.id === row.id ? { ...entry, needsReview: false } : entry) }
    }
    case 'mark-interrupted':
      if (!state.active) return state
      return {
        ...state,
        active: null,
        sessions: [...state.sessions, completed(state.active, new Date(Math.max(Date.parse(at), Date.parse(state.active.startedAt))).toISOString(), true)],
      }
    case 'finalize-report': {
      if (state.reports.some((entry) => entry.id === command.id)) throw new Error('Report ID already exists')
      const report = createWorkHoursReport(state, command, command.evidence, at)
      return { ...state, reports: [...state.reports, report] }
    }
    default: {
      const unsupported: never = command
      throw new Error(`Unsupported work-hours command: ${String(unsupported)}`)
    }
  }
}
