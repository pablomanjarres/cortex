import { getISOWeek } from '@/lib/date-utils'
import type { Habit } from '@/lib/habits'
import type { SprintSession } from '@/lib/sprint-context'
import type { HabitHistory } from '@/features/habits/habit-migration'
import { weeklyHabitScore } from '@/features/habits/habit-progress'

/** One `cortex-founder-history` snapshot. */
export interface FounderHistoryEntry {
  date: string
  commits: number
  users: number
  deploys: number
  mrr: number
  prsOpen: number
  prsMerged: number
}

/** The stored `cortex-weekly-audit-<ISO week>` record. */
export interface WeeklyAudit {
  weekId: string
  weekStart: string
  weekEnd: string
  sprintStats: { totalSessions: number; totalDeepWork: number; avgPerDay: number; bestDay: { date: string; sessions: number } }
  habitStats: { consistency: number }
  founderStats: { commits: number; users: number; mrr: number; deploys: number }
  generatedAt: string
}

export const weeklyAuditKey = (weekId: string) => `cortex-weekly-audit-${weekId}`

/** Builds the audit for the Monday–Sunday week in `weekDates` from stored day data. */
export function buildWeeklyAudit({ weekDates, sessionsByDay, habits, habitHistory, founderHistory, generatedAt }: {
  weekDates: string[]
  sessionsByDay: SprintSession[][]
  habits: Habit[]
  habitHistory: HabitHistory
  founderHistory: FounderHistoryEntry[]
  generatedAt: Date
}): WeeklyAudit {
  const allSessions = sessionsByDay.flat()
  const totalSessions = allSessions.length
  const totalDeepWork = allSessions.reduce((s, x) => s + x.duration, 0)
  const bestDay = sessionsByDay
    .map((s, i) => ({ date: weekDates[i], sessions: s.length }))
    .reduce((best, dc) => dc.sessions > best.sessions ? dc : best, { date: '', sessions: 0 })

  const weekFounder = founderHistory.filter(h => weekDates.includes(h.date))
  const latest = weekFounder.at(-1)

  return {
    weekId: getISOWeek(weekDates[0]),
    weekStart: weekDates[0],
    weekEnd: weekDates[6],
    sprintStats: { totalSessions, totalDeepWork, avgPerDay: Math.round(totalSessions / 7 * 10) / 10, bestDay },
    habitStats: { consistency: weeklyHabitScore(habits, habitHistory, weekDates).score },
    founderStats: {
      commits: weekFounder.reduce((s, h) => s + h.commits, 0),
      users: latest?.users ?? 0,
      mrr: latest?.mrr ?? 0,
      deploys: weekFounder.reduce((s, h) => s + h.deploys, 0),
    },
    generatedAt: generatedAt.toISOString(),
  }
}

