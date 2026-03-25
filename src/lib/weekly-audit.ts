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

interface ShipEntry {
  id: string
  text: string
  time: string
}

interface DailyReflection {
  score: number
  wentWell: string
  improve: string
  learnings: string
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
  shipped: string[]
  avgDayScore: number
  reflectionHighlights: string[]
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
    ...dailyData
  ] = await Promise.all([
    readStore<HabitDef[]>('cortex-habits', []),
    readStore<Record<string, Record<string, boolean>>>('cortex-habits-history', {}),
    readStore<HistoryEntry[]>('cortex-founder-history', []),
    ...dates.flatMap(date => [
      readStore<SprintSession[]>(`cortex-daily-sessions-${date}`, []),
      readStore<ShipEntry[]>(`cortex-daily-shiplog-${date}`, []),
      readStore<DailyReflection>(`cortex-daily-reflection-${date}`, { score: 0, wentWell: '', improve: '', learnings: '' }),
    ]),
  ])

  // Unpack daily data (3 items per day: sessions, ships, reflection)
  const sessionsByDay: SprintSession[][] = []
  const shipsByDay: ShipEntry[][] = []
  const reflectionsByDay: DailyReflection[] = []
  for (let i = 0; i < 7; i++) {
    sessionsByDay.push(dailyData[i * 3] as SprintSession[])
    shipsByDay.push(dailyData[i * 3 + 1] as ShipEntry[])
    reflectionsByDay.push(dailyData[i * 3 + 2] as DailyReflection)
  }

  // Sprint stats
  const allSessions = sessionsByDay.flat()
  const totalSessions = allSessions.length
  const totalDeepWork = allSessions.reduce((s, x) => s + x.duration, 0)
  const dayCounts = sessionsByDay.map((s, i) => ({ date: dates[i], sessions: s.length }))
  const bestDay = dayCounts.reduce((best, d) => d.sessions > best.sessions ? d : best, { date: '', sessions: 0 })

  // Habit stats
  const perHabit = habits.map(h => {
    const completed = dates.filter(d => habitHistory[d]?.[h.id]).length
    return { id: h.id, name: h.name, completed, total: 7 }
  })
  const totalHabitChecks = perHabit.reduce((s, h) => s + h.completed, 0)
  const totalHabitPossible = habits.length * 7
  const consistency = totalHabitPossible > 0 ? Math.round((totalHabitChecks / totalHabitPossible) * 100) : 0

  // Founder stats
  const weekFounder = (founderHistory as HistoryEntry[]).filter(h => dates.includes(h.date))
  const totalCommits = weekFounder.reduce((s, h) => s + h.commits, 0)
  const totalDeploys = weekFounder.reduce((s, h) => s + h.deploys, 0)
  const lastEntry = weekFounder.length > 0 ? weekFounder[weekFounder.length - 1] : null

  // Shipped
  const shipped = shipsByDay.flat().map(s => s.text)

  // Day scores
  const scores = reflectionsByDay.filter(r => r.score > 0).map(r => r.score)
  const avgDayScore = scores.length > 0 ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length * 10) / 10 : 0

  // Reflection highlights
  const reflectionHighlights = reflectionsByDay
    .filter(r => r.wentWell || r.learnings)
    .flatMap(r => [r.wentWell, r.learnings].filter(Boolean))
    .slice(0, 5)

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
    shipped,
    avgDayScore,
    reflectionHighlights,
    generatedAt: new Date().toISOString(),
  }
}
