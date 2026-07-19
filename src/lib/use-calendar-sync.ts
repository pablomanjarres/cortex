// Global calendar sync hook — runs on app startup regardless of which page is active
// Handles initial reconciliation + periodic polling for external changes

import { useEffect, useRef } from 'react'
import { readStore, writeStore } from './store'
import {
  reconcileAssignments,
  reconcileBirthdays,
  reconcileClasses,
  detectExternalChanges,
  reportSyncHealth,
} from './calendar-sync'

// A corrupted key (e.g. a JSON string where an array lives) must degrade to
// "skip + breadcrumb", never throw above the per-item catches — a non-array
// here once killed the whole reconcile silently on every poll.
function asArray<T>(v: unknown, context?: string): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v !== null && v !== undefined && context) reportSyncHealth(context, `expected array, got ${typeof v}`)
  return []
}

interface AssignmentData {
  id: string
  name: string
  courseId: string
  deadline?: string
  done: boolean
  notes?: string
}

interface ContactData {
  id: string
  name: string
  birthday: string
}

interface CourseData {
  id: string
  name: string
}

interface ClassData {
  id: string
  courseName: string
  days: number[]
  startTime: string
  endTime: string
  room?: string
  termStart: string
  termEnd: string
}

// Legacy fallback for event titles — only used if the courses store is empty.
// The live list comes from cortex-student-courses (seeded at launch), so new
// semesters' courses get proper names without touching this file.
const FALLBACK_COURSES: CourseData[] = [
  { id: 'formales', name: 'Formal Languages' },
  { id: 'physics', name: 'Physics II' },
  { id: 'algorithms', name: 'Algorithms' },
  { id: 'dbms', name: 'DB Management' },
  { id: 'stats', name: 'Prob & Stats' },
  { id: 'imagination', name: 'Creativity' },
]

async function loadCourses(): Promise<CourseData[]> {
  const stored = asArray<CourseData>(await readStore<CourseData[]>('cortex-student-courses', []), 'corrupt:cortex-student-courses')
  return stored.length > 0 ? stored : FALLBACK_COURSES
}

export function useCalendarSync() {
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    async function init() {
      try {
        // Load data from store
        const keys = ['cortex-student-assignments', 'cortex-contacts', 'cortex-classes'] as const
        const [assignments, contacts, classes] = (await Promise.all([
          readStore<AssignmentData[]>(keys[0], []),
          readStore<ContactData[]>(keys[1], []),
          readStore<ClassData[]>(keys[2], []),
        ])).map((v, i) => asArray(v, `corrupt:${keys[i]}`)) as [AssignmentData[], ContactData[], ClassData[]]

        // Reconcile assignments with deadlines
        if (assignments.length > 0) {
          await reconcileAssignments(assignments, await loadCourses())
        }

        // Reconcile birthdays
        if (contacts.length > 0) {
          await reconcileBirthdays(contacts)
        }

        // Reconcile the weekly class schedule
        if (classes.length > 0) {
          await reconcileClasses(classes)
        }

        console.log('[Cortex] Calendar sync: initial reconciliation complete')
      } catch (e) {
        console.error('[Cortex] Calendar sync init error:', e)
        reportSyncHealth('init', e)
      }
    }

    // Delay startup sync slightly to let the app settle
    const timeout = setTimeout(init, 2000)
    return () => clearTimeout(timeout)
  }, [])

  // Periodic polling for external changes
  useEffect(() => {
    const poll = async () => {
      try {
        // Reconcile the class schedule so classes added/removed via MCP (which
        // writes cortex-classes directly) reach the calendar without an app restart.
        const classes = asArray<ClassData>(await readStore<ClassData[]>('cortex-classes', []), 'corrupt:cortex-classes')
        await reconcileClasses(classes)

        // Same for assignments: MCP-written deadlines (write_data on
        // cortex-student-assignments) must reach the calendar without waiting
        // for a relaunch. reconcileAssignments hash-compares against the sync
        // state, so unchanged items are no-ops.
        const polledAssignments = asArray<AssignmentData>(await readStore<AssignmentData[]>('cortex-student-assignments', []), 'corrupt:cortex-student-assignments')
        if (polledAssignments.length > 0) {
          await reconcileAssignments(polledAssignments, await loadCourses())
        }

        const changes = await detectExternalChanges()
        if (changes.length === 0) return

        // Apply external changes to the store directly
        for (const ch of changes) {
          if (ch.cortexType === 'assignment' && ch.field === 'deadline' && ch.newValue) {
            // Skip (don't coerce) on a corrupt read: writing [] back would
            // clobber the corrupt-but-recoverable stored value.
            const assignments = await readStore<AssignmentData[]>('cortex-student-assignments', [])
            if (Array.isArray(assignments)) {
              writeStore('cortex-student-assignments', assignments.map((a) =>
                a.id === ch.cortexId ? { ...a, deadline: ch.newValue } : a
              ))
            } else reportSyncHealth('writeback:cortex-student-assignments', 'expected array, skipping external-change writeback')
          }
          if (ch.cortexType === 'birthday' && ch.field === 'birthday' && ch.newValue) {
            const contacts = await readStore<ContactData[]>('cortex-contacts', [])
            if (Array.isArray(contacts)) {
              writeStore('cortex-contacts', contacts.map((c) =>
                c.id === ch.cortexId ? { ...c, birthday: ch.newValue! } : c
              ))
            } else reportSyncHealth('writeback:cortex-contacts', 'expected array, skipping external-change writeback')
          }
        }
        console.log(`[Cortex] Calendar sync: ${changes.length} external changes applied`)
      } catch (e) {
        console.error('[Cortex] Calendar poll error:', e)
        reportSyncHealth('poll', e)
      }
    }

    // First poll after 10s, then every 5 min
    const timeout = setTimeout(poll, 10000)
    const interval = setInterval(poll, 5 * 60 * 1000)
    return () => { clearTimeout(timeout); clearInterval(interval) }
  }, [])
}
