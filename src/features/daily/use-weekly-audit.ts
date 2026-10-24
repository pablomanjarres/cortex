import { useEffect } from 'react'
import { readStore, writeStore } from '@/lib/store'
import { getISOWeek, getWeekDates, localDate } from '@/lib/date-utils'
import type { Habit } from '@/lib/habits'
import type { SprintSession } from '@/lib/sprint-context'
import type { HabitHistory } from '@/features/habits/habit-migration'
import { DEFAULT_HABITS } from '@/features/habits/habit-defaults'
import { buildWeeklyAudit, weeklyAuditKey, type FounderHistoryEntry } from './weekly-audit'

/**
 * On Mondays, writes last week's audit once. Keyed to the reactive day so it
 * re-checks after a midnight rollover while the app stays open; an existing
 * audit is never overwritten.
 */
export function useWeeklyAuditAutoTrigger(today: string) {
  useEffect(() => {
    const now = new Date(today + 'T00:00:00')
    if (now.getDay() !== 1) return
    const lastMonday = new Date(now)
    lastMonday.setDate(lastMonday.getDate() - 7)
    const weekDates = getWeekDates(localDate(lastMonday))
    const key = weeklyAuditKey(getISOWeek(weekDates[0]))

    readStore(key, null).then(async (existing) => {
      if (existing) return
      const [sessionsByDay, habitHistory, founderHistory, habits] = await Promise.all([
        Promise.all(weekDates.map(date => readStore<SprintSession[]>(`cortex-daily-sessions-${date}`, []))),
        readStore<HabitHistory>('cortex-habits-history', {}),
        readStore<FounderHistoryEntry[]>('cortex-founder-history', []),
        // Read habits fresh from the store: a hook value can still be the
        // synchronous fallback when this runs.
        readStore<Habit[]>('cortex-habits', DEFAULT_HABITS),
      ])
      writeStore(key, buildWeeklyAudit({ weekDates, sessionsByDay, habits, habitHistory, founderHistory, generatedAt: new Date() }))
    })
  }, [today])
}
