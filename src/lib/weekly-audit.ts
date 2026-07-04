import { readStore } from './store'
import { getWeekDates, getISOWeek } from './date-utils'

// ─── Types ────────────────────────────────────────────────

export interface SprintSession {
  id: string
  task: string
  duration: number
  startedAt: string
  completedAt: string
}

interface HistoryEntry {
  date: string
  commits: number
  users: number
  deploys: number
  mrr: number
  prsOpen: number
  prsMerged: number
}

interface HabitDef {
  id: string
  name: string
  emoji: string
}

export interface WeeklyAudit {
  weekId: string
  weekStart: string
  weekEnd: string
  sprintStats: {
    totalSessions: number
    totalDeepWork: number
    avgPerDay: number
    bestDay: { date: string; sessions: number }
  }
  habitStats: {
    consistency: number
    perHabit: { id: string; name: string; completed: number; total: number }[]
  }
  founderStats: {
    commits: number
    users: number
    mrr: number
    deploys: number
  }
  generatedAt: string
}

// ─── Generator ──────────────────────────────────────────

export async function generateWeeklyAudit(weekStartDate: string): Promise<WeeklyAudit> {
  const dates = getWeekDates(weekStartDate)
  const weekId = getISOWeek(weekStartDate)

  // Load all data in parallel
  const [
    habits,
    habitHistory,
    founderHistory,
    ...sessionData
  ] = await Promise.all([
    readStore<HabitDef[]>('cortex-habits', []),
    readStore<Record<string, Record<string, boolean>>>('cortex-habits-history', {}),
    readStore<HistoryEntry[]>('cortex-founder-history', []),
    ...dates.map(date => readStore<SprintSession[]>(`cortex-daily-sessions-${date}`, [])),
  ])

  const sessionsByDay = sessionData as SprintSession[][]

  // Sprint stats
  const allSessions = sessionsByDay.flat()
  const totalSessions = allSessions.length
  const totalDeepWork = allSessions.reduce((s, x) => s + x.duration, 0)
  const dayCounts = sessionsByDay.map((s, i) => ({ date: dates[i], sessions: s.length }))
  const bestDay = dayCounts.reduce((best, d) => d.sessions > best.sessions ? d : best, { date: '', sessions: 0 })

  // Habit stats — weekly cadence only (monthly habits aren't measured over a single week)
  const weeklyHabits = habits.filter(h => ((h as any).cadence ?? 'weekly') !== 'monthly')
  const perHabit = weeklyHabits.map(h => {
    const completed = dates.filter(d => habitHistory[d]?.[h.id]).length
    return { id: h.id, name: h.name, completed, total: 7 }
  })
  const totalHabitChecks = perHabit.reduce((s, h) => s + h.completed, 0)
  const totalHabitPossible = weeklyHabits.length * 7
  const consistency = totalHabitPossible > 0 ? Math.round((totalHabitChecks / totalHabitPossible) * 100) : 0

  // Founder stats
  const weekFounder = (founderHistory as HistoryEntry[]).filter(h => dates.includes(h.date))
  const totalCommits = weekFounder.reduce((s, h) => s + h.commits, 0)
  const totalDeploys = weekFounder.reduce((s, h) => s + h.deploys, 0)
  const lastEntry = weekFounder.length > 0 ? weekFounder[weekFounder.length - 1] : null

  return {
    weekId,
    weekStart: dates[0],
    weekEnd: dates[6],
    sprintStats: {
      totalSessions,
      totalDeepWork,
      avgPerDay: Math.round(totalSessions / 7 * 10) / 10,
      bestDay,
    },
    habitStats: { consistency, perHabit },
    founderStats: {
      commits: totalCommits,
      users: lastEntry?.users ?? 0,
      mrr: lastEntry?.mrr ?? 0,
      deploys: totalDeploys,
    },
    generatedAt: new Date().toISOString(),
  }
}
