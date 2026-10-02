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

function validProjectName(value: string): string {
  const name = value.trim()
  if (!name) throw new Error('Project name is required')
  if (name.length > 120) throw new Error('Project name is too long')
  return name
}

function saveCorrection(state: WorkHoursState, row: WorkSession, after: WorkSessionValues, at: string, durationMs = row.durationMs): WorkHoursState {
  const before = currentValues(row)
  if (JSON.stringify(before) === JSON.stringify(after)) return state
  return {
    ...state,
    sessions: state.sessions.map((entry) => entry.id === row.id ? {
      ...entry,
      ...after,
      durationMs,
      corrections: [...entry.corrections, { correctedAt: at, before, after }],
    } : entry),
  }
}

export function applyWorkHoursCommand(state: WorkHoursState, command: WorkHoursCommand, now: string): WorkHoursState {
  const at = iso(now)
  switch (command.type) {
    case 'add-project': {
      const projectId = id(command.id)
      const name = validProjectName(command.name)
      if (state.projects.some((entry) => entry.id === projectId)) throw new Error('Project ID already exists')
      return { ...state, projects: [...state.projects, { id: projectId, name, ratePerHour: null, currency: 'COP' }] }
    }
    case 'rename-project': {
      const previous = project(state, command.projectId)
      const name = validProjectName(command.name)
      if (previous.name === name) return state
      return {
        ...state,
        projects: state.projects.map((entry) => entry.id === previous.id ? { ...entry, name } : entry),
      }
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
    case 'start-owned-at': {
      const startedAt = iso(command.startedAt)
      const sessionId = id(command.id)
      project(state, command.projectId)
      if (Date.parse(startedAt) > Date.parse(at)) throw new Error('Recorded start cannot be in the future')
      const existing = state.active?.id === sessionId ? state.active : state.sessions.find((entry) => entry.id === sessionId)
      if (existing) {
        if (existing.projectId !== command.projectId || existing.startedAt !== startedAt) throw new Error('Recorded start conflicts with existing session')
        return state
      }
      return applyWorkHoursCommand(state, { type: 'start', id: sessionId, projectId: command.projectId }, startedAt)
    }
    case 'stop-owned-at': {
      const sessionId = id(command.id)
      const endedAt = iso(command.endedAt)
      if (Date.parse(endedAt) > Date.parse(at)) throw new Error('Recorded stop cannot be in the future')
      const saved = state.sessions.find((entry) => entry.id === sessionId)
      if (saved?.needsReview) {
        if (Date.parse(endedAt) < Date.parse(saved.startedAt)) throw new Error('Stop time precedes start time')
        const start = Date.parse(saved.startedAt), end = Date.parse(endedAt)
        if (state.sessions.some((entry) => entry.id !== sessionId && overlaps(start, end, Date.parse(entry.startedAt), Date.parse(entry.endedAt)))) throw new Error('Recorded stop overlaps another session')
        if (state.active && overlaps(start, end, Date.parse(state.active.startedAt), Date.parse(at))) throw new Error('Recorded stop overlaps active work')
        const corrected = saveCorrection(state, saved, { ...currentValues(saved), endedAt }, at, Date.parse(endedAt) - Date.parse(saved.startedAt))
        return { ...corrected, sessions: corrected.sessions.map((entry) => entry.id === sessionId ? { ...entry, needsReview: false } : entry) }
      }
      return applyWorkHoursCommand(state, { type: 'stop-owned', id: sessionId }, endedAt)
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
    case 'stop-owned':
      if (command.type === 'stop-owned' && state.active?.id !== id(command.id)) return state
      if (!state.active) return state
      return { ...state, active: null, sessions: [...state.sessions, completed(state.active, at, state.active.interrupted)] }
    case 'attach-deliverable': {
      const sessionId = id(command.id)
      const row = state.sessions.find((entry) => entry.id === sessionId)
      if (!row) throw new Error('Session not found')
      if (typeof command.prUrl !== 'string' || typeof command.description !== 'string') throw new Error('Invalid deliverable')
      const prUrl = validPrUrl(command.prUrl)
      if (row.prUrl && row.prUrl !== prUrl) throw new Error('Session already has a different PR')
      return saveCorrection(state, row, {
        ...currentValues(row),
        prUrl,
        description: row.description.trim() ? row.description : command.description.trim(),
      }, at)
    }
    case 'set-rate': {
      project(state, command.projectId)
      const rate = command.ratePerHour
      if (rate !== null && (!Number.isFinite(rate) || rate < 0)) throw new Error('Invalid hourly rate')
      return {
        ...state,
        projects: state.projects.map((entry) => entry.id === command.projectId ? { ...entry, ratePerHour: rate } : entry),
      }
    }
    case 'set-billing-policy': {
      project(state, command.projectId)
      if (!Number.isFinite(command.includedHours) || command.includedHours < 0 || !Number.isInteger(command.cycleDay) || command.cycleDay < 1 || command.cycleDay > 28 || typeof command.timeZone !== 'string' || !command.timeZone.trim()) throw new Error('Invalid billing policy')
      new Intl.DateTimeFormat('en-US', { timeZone: command.timeZone }).format()
      const billing = { includedHours: command.includedHours, cycleDay: command.cycleDay, timeZone: command.timeZone }
      return { ...state, projects: state.projects.map((entry) => entry.id === command.projectId ? { ...entry, billing } : entry) }
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
      return saveCorrection(state, row, after, at, endMs - startMs)
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
