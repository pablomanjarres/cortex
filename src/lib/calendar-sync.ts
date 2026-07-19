// Bidirectional calendar sync engine
// Manages mappings between Cortex entities (assignments, birthdays) and Calendar.app events
// Calendar.app syncs upstream to Google Calendar automatically

import { readStore, writeStore } from './store'
import { localDate } from './date-utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEventPayload {
  title: string
  startDate: string
  endDate?: string
  isAllDay: boolean
  calendar?: string
  notes?: string
  recurrence?: string
  calendarColor?: string
  createCalendarIfMissing?: boolean
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
  cortexType: 'assignment' | 'birthday' | 'class'
  calendarEventId: string
  lastSyncedHash: string
  calendarLastModified: string
}

export interface CalendarSyncState {
  mappings: CalendarMapping[]
  lastPolled: string
}

// ── Sync health breadcrumbs ──────────────────────────────────────────────────
// The renderer console is invisible in the installed app, so sync failures
// used to vanish (the assignment leg was dead for 13 days with zero signal).
// Every catch below records its last error here; probes can read the key.
const HEALTH_KEY = 'cortex-calendar-sync-health'
export function reportSyncHealth(context: string, error?: unknown): void {
  const entry = {
    context,
    at: new Date().toISOString(),
    ...(error !== undefined ? { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) } : {}),
  }
  readStore<Record<string, unknown>>(HEALTH_KEY, {}).then((prev) => {
    writeStore(HEALTH_KEY, { ...prev, [error !== undefined ? 'lastError' : 'lastOk']: entry })
  }).catch(() => { /* health reporting must never throw */ })
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

// A recurring weekly class meeting (e.g. "Cálculo 3, Mon/Wed 10:00–11:30, all term").
interface ClassLike {
  id: string
  courseName: string
  days: number[]    // weekday indexes, 0 = Monday … 6 = Sunday
  startTime: string // "HH:MM" (24h, local)
  endTime: string   // "HH:MM"
  room?: string
  termStart: string // "YYYY-MM-DD" — first week of classes
  termEnd: string   // "YYYY-MM-DD" — last week of classes (recurrence stops here)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORE_KEY = 'cortex-calendar-sync'
const DEFAULT_STATE: CalendarSyncState = { mappings: [], lastPolled: '' }

// Classes sync into their own calendar so they show up purple (EventKit colors
// per-calendar, not per-event). The helper creates it on demand with this color.
const CLASSES_CALENDAR = 'Classes (Cortex)'
const CLASSES_COLOR = '#8B5CF6' // tailwind purple-500
const EXAMS_CALENDAR = 'Exams (Cortex)'
const EXAMS_COLOR = '#EF4444' // tailwind red-500
const BIRTHDAYS_CALENDAR = 'Birthdays (Cortex)'
const BIRTHDAYS_COLOR = '#FBBF24' // tailwind amber-400 (yellow)
const BYDAY_TOKENS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] // index 0=Mon … 6=Sun

// First calendar date on/after termStart whose weekday is one of `days`.
function firstClassDate(termStart: string, days: number[]): string {
  const start = new Date(termStart + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const monIdx = (d.getDay() + 6) % 7 // JS 0=Sun → our 0=Mon
    if (days.includes(monIdx)) return localDate(d)
  }
  return termStart
}

// ─── Hash ─────────────────────────────────────────────────────────────────────

function syncHash(fields: Record<string, string | undefined>): string {
  const json = JSON.stringify(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)))
  // btoa alone throws InvalidCharacterError on non-Latin1 input (em-dashes and
  // similar in assignment titles), which killed every sync for those items —
  // encode to UTF-8 bytes first. Formula change invalidates stored hashes once,
  // causing a single harmless re-update of already-mapped events.
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)))
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
      calendar: EXAMS_CALENDAR,
      calendarColor: EXAMS_COLOR,
      createCalendarIfMissing: true,
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
    reportSyncHealth('assignment-sync', e)
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
      calendar: BIRTHDAYS_CALENDAR,
      calendarColor: BIRTHDAYS_COLOR,
      createCalendarIfMissing: true,
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
    reportSyncHealth('birthday-sync', e)
  } finally {
    _syncLock = false
  }
}

export async function syncClassToCalendar(
  cls: ClassLike,
  action: 'upsert' | 'delete'
): Promise<void> {
  if (_syncLock) return
  _syncLock = true
  try {
    const api = await calendarAPI()
    const state = await getState()

    if (action === 'delete') {
      const mapping = findMapping(state, cls.id)
      if (mapping) {
        await api.delete(mapping.calendarEventId)
        saveState(removeMapping(state, cls.id))
      }
      return
    }

    // A class needs at least one weekday, a start time, and a term to recur over.
    const validDays = (cls.days || []).filter((d) => d >= 0 && d <= 6)
    if (validDays.length === 0 || !cls.startTime || !cls.termStart || !cls.termEnd || !cls.courseName.trim()) {
      const existing = findMapping(state, cls.id)
      if (existing) {
        await api.delete(existing.calendarEventId)
        saveState(removeMapping(state, cls.id))
      }
      return
    }

    const first = firstClassDate(cls.termStart, validDays)
    const startISO = new Date(`${first}T${cls.startTime}:00`).toISOString()
    const endISO = new Date(`${first}T${cls.endTime || cls.startTime}:00`).toISOString()
    const byday = [...validDays].sort((a, b) => a - b).map((d) => BYDAY_TOKENS[d]).join(',')
    const until = cls.termEnd.replace(/-/g, '')
    const recurrence = `FREQ=WEEKLY;BYDAY=${byday};UNTIL=${until}`

    const title = `Class: ${cls.courseName.trim()}${cls.room ? ` · ${cls.room}` : ''}`
    const notes = `cortex:class:${cls.id}${cls.room ? `\nRoom: ${cls.room}` : ''}`
    const hash = syncHash({ title, startISO, endISO, recurrence, notes })
    const existing = findMapping(state, cls.id)
    if (existing && existing.lastSyncedHash === hash) return

    const payload: CalendarEventPayload = {
      title,
      startDate: startISO,
      endDate: endISO,
      isAllDay: false,
      calendar: CLASSES_CALENDAR,
      calendarColor: CLASSES_COLOR,
      createCalendarIfMissing: true,
      notes,
      recurrence,
    }

    // Recurrence/day/time changes can't be reliably patched in place, so replace
    // the event: delete the stale one, then create fresh.
    if (existing) await api.delete(existing.calendarEventId)
    const result = await api.create(payload)
    if (result.success && result.id) {
      saveState(upsertMapping(state, {
        cortexId: cls.id,
        cortexType: 'class',
        calendarEventId: result.id,
        lastSyncedHash: hash,
        calendarLastModified: new Date().toISOString(),
      }))
    } else if (existing) {
      // Old event is gone but recreate failed — drop the dangling mapping.
      saveState(removeMapping(state, cls.id))
    }
  } catch (e) {
    console.error('[Cortex] Calendar sync error (class):', e)
    reportSyncHealth('class-sync', e)
  } finally {
    _syncLock = false
  }
}

// ─── Pull: Calendar → Cortex ──────────────────────────────────────────────────

export interface ExternalChange {
  cortexId: string
  cortexType: 'assignment' | 'birthday' | 'class'
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
    const start = localDate(new Date(Date.now() - 30 * 86400000))
    const end = localDate(new Date(Date.now() + 365 * 86400000))
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
    reportSyncHealth('external-pull', e)
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
    } else if (a.done) {
      // Remove calendar events for graded/done assignments (keeps deadline in app data)
      await syncAssignmentToCalendar(a, courseMap[a.courseId] || a.courseId, 'delete')
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

export async function reconcileClasses(
  classes: ClassLike[]
): Promise<void> {
  for (const cls of classes) {
    await syncClassToCalendar(cls, 'upsert')
  }
  // Prune calendar events for classes removed elsewhere (e.g. via an MCP tool that
  // writes cortex-classes directly). Only when the list is non-empty, so a transient
  // or failed empty read can never mass-delete every class event.
  if (classes.length > 0) {
    const ids = new Set(classes.map((c) => c.id))
    const state = await getState()
    const orphans = state.mappings.filter((m) => m.cortexType === 'class' && !ids.has(m.cortexId))
    for (const m of orphans) {
      await syncClassToCalendar(
        { id: m.cortexId, courseName: '', days: [], startTime: '', endTime: '', termStart: '', termEnd: '' },
        'delete'
      )
    }
  }
}
