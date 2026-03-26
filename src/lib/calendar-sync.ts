// Bidirectional calendar sync engine
// Manages mappings between Cortex entities (assignments, birthdays) and Calendar.app events
// Calendar.app syncs upstream to Google Calendar automatically

import { readStore, writeStore } from './store'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEventPayload {
  title: string
  startDate: string
  endDate?: string
  isAllDay: boolean
  calendar?: string
  notes?: string
  recurrence?: string
}

interface CalendarEventResult {
  id: string
  title: string
  startDate: string
  endDate: string
  calendar: string
  isAllDay: boolean
  notes: string
  lastModified: string
  recurrence: string
}

export interface CalendarMapping {
  cortexId: string
  cortexType: 'assignment' | 'birthday'
  calendarEventId: string
  lastSyncedHash: string
  calendarLastModified: string
}

export interface CalendarSyncState {
  mappings: CalendarMapping[]
  lastPolled: string
}

interface AssignmentLike {
  id: string
  name: string
  courseId: string
  deadline?: string
  done: boolean
  notes?: string
}

interface ContactLike {
  id: string
  name: string
  birthday: string
}

interface CourseLike {
  id: string
  name: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORE_KEY = 'cortex-calendar-sync'
const DEFAULT_STATE: CalendarSyncState = { mappings: [], lastPolled: '' }
const TARGET_CALENDAR = 'user@example.com'

// ─── Hash ─────────────────────────────────────────────────────────────────────

function syncHash(fields: Record<string, string | undefined>): string {
  return btoa(JSON.stringify(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))))
}

// ─── State Management ─────────────────────────────────────────────────────────

let _state: CalendarSyncState | null = null
let _stateLoaded = false
let _syncLock = false

async function getState(): Promise<CalendarSyncState> {
  if (!_stateLoaded) {
    _state = await readStore<CalendarSyncState>(STORE_KEY, DEFAULT_STATE)
    _stateLoaded = true
  }
  return _state!
}

function saveState(state: CalendarSyncState): void {
  _state = state
  writeStore(STORE_KEY, state)
}

function findMapping(state: CalendarSyncState, cortexId: string): CalendarMapping | undefined {
  return state.mappings.find((m) => m.cortexId === cortexId)
}

function upsertMapping(state: CalendarSyncState, mapping: CalendarMapping): CalendarSyncState {
  const idx = state.mappings.findIndex((m) => m.cortexId === mapping.cortexId)
  const mappings = [...state.mappings]
  if (idx >= 0) mappings[idx] = mapping
  else mappings.push(mapping)
  return { ...state, mappings }
}

function removeMapping(state: CalendarSyncState, cortexId: string): CalendarSyncState {
  return { ...state, mappings: state.mappings.filter((m) => m.cortexId !== cortexId) }
}

// ─── Calendar API abstraction (works via Electron IPC or HTTP) ────────────────

async function calendarAPI() {
  if (window.electronAPI?.calendar) {
    return {
      create: window.electronAPI.calendar.createEvent,
      update: window.electronAPI.calendar.updateEvent,
      delete: window.electronAPI.calendar.deleteEvent,
      getEventsInRange: window.electronAPI.calendar.getEventsInRange,
      getEvent: window.electronAPI.calendar.getEvent,
    }
  }
  // HTTP fallback for browser/PWA
  return {
    create: async (payload: CalendarEventPayload) => {
      const res = await fetch('/api/calendar/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      return res.json()
    },
    update: async (eventId: string, payload: Partial<CalendarEventPayload>) => {
      const res = await fetch(`/api/calendar/update/${encodeURIComponent(eventId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      return res.json()
    },
    delete: async (eventId: string) => {
      const res = await fetch(`/api/calendar/delete/${encodeURIComponent(eventId)}`, { method: 'POST' })
      return res.json()
    },
    getEventsInRange: async (start: string, end: string) => {
      const res = await fetch(`/api/calendar/events?start=${start}&end=${end}`)
      return res.json()
    },
    getEvent: async (_eventId: string) => {
      return null as CalendarEventResult | null
    },
  }
}

// ─── Push: Cortex → Calendar ──────────────────────────────────────────────────

export async function syncAssignmentToCalendar(
  assignment: AssignmentLike,
  courseName: string,
  action: 'upsert' | 'delete'
): Promise<void> {
  if (_syncLock) return
  _syncLock = true
  try {
    const api = await calendarAPI()
    const state = await getState()

    if (action === 'delete') {
      const mapping = findMapping(state, assignment.id)
      if (mapping) {
        await api.delete(mapping.calendarEventId)
        saveState(removeMapping(state, assignment.id))
      }
      return
    }

    // Skip assignments without deadlines
    if (!assignment.deadline) {
      // If there was a mapping and deadline was removed, delete the event
      const existing = findMapping(state, assignment.id)
      if (existing) {
        await api.delete(existing.calendarEventId)
        saveState(removeMapping(state, assignment.id))
      }
      return
    }

    const title = `[${courseName}] ${assignment.name}`
    const hash = syncHash({ title, deadline: assignment.deadline })
    const existing = findMapping(state, assignment.id)

    // Nothing changed
    if (existing && existing.lastSyncedHash === hash) return

    const payload: CalendarEventPayload = {
      title,
      startDate: assignment.deadline,
      isAllDay: true,
      calendar: TARGET_CALENDAR,
      notes: `cortex:assignment:${assignment.id}`,
    }

    if (existing) {
      // Update existing event
      await api.update(existing.calendarEventId, payload)
      saveState(upsertMapping(state, { ...existing, lastSyncedHash: hash, calendarLastModified: new Date().toISOString() }))
    } else {
      // Create new event
      const result = await api.create(payload)
      if (result.success && result.id) {
        saveState(upsertMapping(state, {
          cortexId: assignment.id,
          cortexType: 'assignment',
          calendarEventId: result.id,
          lastSyncedHash: hash,
          calendarLastModified: new Date().toISOString(),
        }))
      }
    }
  } catch (e) {
    console.error('[Cortex] Calendar sync error (assignment):', e)
  } finally {
    _syncLock = false
  }
}

export async function syncBirthdayToCalendar(
  contact: ContactLike,
  action: 'upsert' | 'delete'
): Promise<void> {
  if (_syncLock) return
  _syncLock = true
  try {
    const api = await calendarAPI()
    const state = await getState()

    if (action === 'delete') {
      const mapping = findMapping(state, contact.id)
      if (mapping) {
        await api.delete(mapping.calendarEventId)
        saveState(removeMapping(state, contact.id))
      }
      return
    }

    if (!contact.birthday) {
      const existing = findMapping(state, contact.id)
      if (existing) {
        await api.delete(existing.calendarEventId)
        saveState(removeMapping(state, contact.id))
      }
      return
    }

    const title = `Birthday: ${contact.name}`
    const hash = syncHash({ title, birthday: contact.birthday })
    const existing = findMapping(state, contact.id)

    if (existing && existing.lastSyncedHash === hash) return

    const payload: CalendarEventPayload = {
      title,
      startDate: contact.birthday,
      isAllDay: true,
      calendar: TARGET_CALENDAR,
      notes: `cortex:birthday:${contact.id}`,
      recurrence: 'FREQ=YEARLY',
    }

    if (existing) {
      await api.update(existing.calendarEventId, payload)
      saveState(upsertMapping(state, { ...existing, lastSyncedHash: hash, calendarLastModified: new Date().toISOString() }))
    } else {
      const result = await api.create(payload)
      if (result.success && result.id) {
        saveState(upsertMapping(state, {
          cortexId: contact.id,
          cortexType: 'birthday',
          calendarEventId: result.id,
          lastSyncedHash: hash,
          calendarLastModified: new Date().toISOString(),
        }))
      }
    }
  } catch (e) {
    console.error('[Cortex] Calendar sync error (birthday):', e)
  } finally {
    _syncLock = false
  }
}

// ─── Pull: Calendar → Cortex ──────────────────────────────────────────────────

export interface ExternalChange {
  cortexId: string
  cortexType: 'assignment' | 'birthday'
  field: 'deadline' | 'birthday' | 'title' | 'deleted'
  oldValue?: string
  newValue?: string
}

export async function detectExternalChanges(): Promise<ExternalChange[]> {
  if (_syncLock) return []
  _syncLock = true
  try {
    const api = await calendarAPI()
    const state = await getState()
    const changes: ExternalChange[] = []

    if (state.mappings.length === 0) return []

    // Get events in a wide range covering all possible deadlines/birthdays
    const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const end = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
    const calendarEvents = await api.getEventsInRange(start, end)

    const calEventMap = new Map<string, CalendarEventResult>()
    for (const evt of calendarEvents) {
      calEventMap.set(evt.id, evt)
    }

    let updated = false
    const newMappings = [...state.mappings]

    for (let i = 0; i < newMappings.length; i++) {
      const mapping = newMappings[i]
      const calEvent = calEventMap.get(mapping.calendarEventId)

      if (!calEvent) {
        // Event was deleted externally
        changes.push({ cortexId: mapping.cortexId, cortexType: mapping.cortexType, field: 'deleted' })
        continue
      }

      // Check if calendar event was modified since last sync
      if (calEvent.lastModified && calEvent.lastModified > mapping.calendarLastModified) {
        const calDate = calEvent.startDate.slice(0, 10)

        if (mapping.cortexType === 'assignment') {
          // Check if deadline changed
          const currentHash = mapping.lastSyncedHash
          const title = calEvent.title
          const newHash = syncHash({ title, deadline: calDate })
          if (newHash !== currentHash) {
            changes.push({
              cortexId: mapping.cortexId,
              cortexType: 'assignment',
              field: 'deadline',
              newValue: calDate,
            })
            newMappings[i] = { ...mapping, lastSyncedHash: newHash, calendarLastModified: calEvent.lastModified }
            updated = true
          }
        } else if (mapping.cortexType === 'birthday') {
          const calDate2 = calEvent.startDate.slice(0, 10)
          const title = calEvent.title
          const newHash = syncHash({ title, birthday: calDate2 })
          if (newHash !== mapping.lastSyncedHash) {
            changes.push({
              cortexId: mapping.cortexId,
              cortexType: 'birthday',
              field: 'birthday',
              newValue: calDate2,
            })
            newMappings[i] = { ...mapping, lastSyncedHash: newHash, calendarLastModified: calEvent.lastModified }
            updated = true
          }
        }
      }
    }

    if (updated) {
      saveState({ ...state, mappings: newMappings, lastPolled: new Date().toISOString() })
    }

    return changes
  } catch (e) {
    console.error('[Cortex] Calendar pull error:', e)
    return []
  } finally {
    _syncLock = false
  }
}

// ─── Batch sync (for initial reconciliation) ─────────────────────────────────

export async function reconcileAssignments(
  assignments: AssignmentLike[],
  courses: CourseLike[]
): Promise<void> {
  const courseMap = Object.fromEntries(courses.map((c) => [c.id, c.name]))
  for (const a of assignments) {
    if (a.deadline && !a.done) {
      await syncAssignmentToCalendar(a, courseMap[a.courseId] || a.courseId, 'upsert')
    }
  }
}

export async function reconcileBirthdays(
  contacts: ContactLike[]
): Promise<void> {
  for (const c of contacts) {
    if (c.birthday) {
      await syncBirthdayToCalendar(c, 'upsert')
    }
  }
}
