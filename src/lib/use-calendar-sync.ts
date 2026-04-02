// Global calendar sync hook — runs on app startup regardless of which page is active
// Handles initial reconciliation + periodic polling for external changes

import { useEffect, useRef } from 'react'
import { readStore, writeStore } from './store'
import {
  reconcileAssignments,
  reconcileBirthdays,
  detectExternalChanges,
} from './calendar-sync'

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

// Hardcoded course list matching StudentPage — needed for event titles
const COURSES: CourseData[] = [
  { id: 'formales', name: 'Formal Languages' },
  { id: 'physics', name: 'Physics II' },
  { id: 'algorithms', name: 'Algorithms' },
  { id: 'dbms', name: 'DB Management' },
  { id: 'stats', name: 'Prob & Stats' },
  { id: 'imagination', name: 'Creativity' },
]

export function useCalendarSync() {
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    async function init() {
      try {
        // Load data from store
        const [assignments, contacts] = await Promise.all([
          readStore<AssignmentData[]>('cortex-student-assignments', []),
          readStore<ContactData[]>('cortex-contacts', []),
        ])

        // Reconcile assignments with deadlines
        if (assignments.length > 0) {
          await reconcileAssignments(assignments, COURSES)
        }

        // Reconcile birthdays
        if (contacts.length > 0) {
          await reconcileBirthdays(contacts)
        }

        console.log('[Cortex] Calendar sync: initial reconciliation complete')
      } catch (e) {
        console.error('[Cortex] Calendar sync init error:', e)
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
        const changes = await detectExternalChanges()
        if (changes.length === 0) return

        // Apply external changes to the store directly
        for (const ch of changes) {
          if (ch.cortexType === 'assignment' && ch.field === 'deadline' && ch.newValue) {
            const assignments = await readStore<AssignmentData[]>('cortex-student-assignments', [])
            const updated = assignments.map((a) =>
              a.id === ch.cortexId ? { ...a, deadline: ch.newValue } : a
            )
            writeStore('cortex-student-assignments', updated)
          }
          if (ch.cortexType === 'birthday' && ch.field === 'birthday' && ch.newValue) {
            const contacts = await readStore<ContactData[]>('cortex-contacts', [])
            const updated = contacts.map((c) =>
              c.id === ch.cortexId ? { ...c, birthday: ch.newValue! } : c
            )
            writeStore('cortex-contacts', updated)
          }
        }
        console.log(`[Cortex] Calendar sync: ${changes.length} external changes applied`)
      } catch (e) {
        console.error('[Cortex] Calendar poll error:', e)
      }
    }

    // First poll after 10s, then every 5 min
    const timeout = setTimeout(poll, 10000)
    const interval = setInterval(poll, 5 * 60 * 1000)
    return () => { clearTimeout(timeout); clearInterval(interval) }
  }, [])
}
