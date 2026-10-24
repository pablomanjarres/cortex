import { localDate } from '@/lib/date-utils'
import { isActiveHabit, type Cadence, type Habit } from '@/lib/habits'
import type { HabitHistory } from './habit-migration'

export interface HabitProgress {
  cadence: Cadence
  goal: number
  done: number
  met: boolean
}

export interface WeeklyHabitScore {
  /** Average goal completion of scored weekly habits, 0–100. */
  score: number
  /** Completions counted toward goals (capped per habit). */
  completed: number
  /** Sum of weekly goals of scored habits. */
  goals: number
  rows: { habit: Habit; done: number; goal: number }[]
}

export const habitCadence = (habit: Pick<Habit, 'cadence'>): Cadence => habit.cadence ?? 'weekly'

export const habitGoal = (habit: Pick<Habit, 'cadence' | 'weeklyGoal' | 'monthlyGoal'>): number =>
  habitCadence(habit) === 'monthly' ? (habit.monthlyGoal ?? 1) : (habit.weeklyGoal ?? 7)

// Parse a goal input. A goal of 0 is allowed — it means the habit has no
// required completions this week/month (paused / optional, still trackable).
// A blank or invalid input falls back to the cadence default; an explicit 0 is
// kept (note: `parseInt('0') || 7` would wrongly coerce 0 back to the default).
export function parseGoal(raw: string, cadence: Cadence): number {
  const max = cadence === 'monthly' ? 31 : 7
  const fallback = cadence === 'monthly' ? 1 : 7
  const t = raw.trim()
  if (t === '') return fallback
  const n = parseInt(t, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(Math.max(n, 0), max)
}

/** Habit goal fields for a cadence; the other cadence's goal is dropped. */
export function withGoal<T extends Habit>(habit: T, cadence: Cadence, rawGoal: string): T {
  const next: T = { ...habit, cadence }
  if (cadence === 'monthly') {
    next.monthlyGoal = parseGoal(rawGoal, 'monthly')
    delete next.weeklyGoal
  } else {
    next.weeklyGoal = parseGoal(rawGoal, 'weekly')
    delete next.monthlyGoal
  }
  return next
}

/** Short goal label, or null for the default every-day weekly goal. */
export function habitGoalLabel(habit: Habit): string | null {
  const goal = habitGoal(habit)
  if (habitCadence(habit) === 'monthly') return `${goal}x/mo`
  return goal < 7 ? `${goal}x/wk` : null
}

/** All calendar dates (YYYY-MM-DD) in the month containing the anchor date. */
export function monthDates(anchorDateStr: string): string[] {
  const anchor = new Date(anchorDateStr + 'T00:00:00')
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) => localDate(new Date(year, month, i + 1)))
}

const countDone = (history: HabitHistory, habitId: string, dates: string[]) =>
  dates.filter((d) => history[d]?.[habitId]).length

/** Cadence-aware progress: weekly habits over the week, monthly over the week's month. */
export function habitProgress(habit: Habit, history: HabitHistory, weekDates: string[]): HabitProgress {
  const cadence = habitCadence(habit)
  const goal = habitGoal(habit)
  const done = countDone(history, habit.id, cadence === 'monthly' ? monthDates(weekDates[0]) : weekDates)
  return { cadence, goal, done, met: done >= goal }
}

/**
 * Weekly score respects per-habit goals (e.g. Train 3/week = 100% at 3).
 * Held and monthly habits are excluded; 0-goal habits are "not required this
 * week" and neither inflate the score nor divide by zero.
 */
export function weeklyHabitScore(habits: Habit[], history: HabitHistory, weekDates: string[]): WeeklyHabitScore {
  const rows = habits
    .filter((h) => isActiveHabit(h) && habitCadence(h) === 'weekly')
    .map((habit) => ({ habit, done: countDone(history, habit.id, weekDates), goal: habitGoal(habit) }))
  const scored = rows.filter((r) => r.goal > 0)
  const score = scored.length > 0
    ? Math.round(scored.reduce((s, r) => s + Math.min(r.done / r.goal, 1), 0) / scored.length * 100)
    : 0
  return {
    score,
    completed: scored.reduce((s, r) => s + Math.min(r.done, r.goal), 0),
    goals: scored.reduce((s, r) => s + r.goal, 0),
    rows,
  }
}

/** Consecutive days, back from `today`, with the habit checked. */
export function dailyStreak(history: HabitHistory, habitId: string, today = new Date()): number {
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    if (!history[localDate(d)]?.[habitId]) break
    streak++
  }
  return streak
}

// Consecutive calendar months (back from now) whose completions met the monthly goal.
// The current, still-in-progress month never breaks the streak — it just doesn't count yet.
export function monthlyStreak(history: HabitHistory, habitId: string, goal: number, now = new Date()): number {
  if (goal <= 0) return 0 // no target ⇒ no streak to earn
  let streak = 0
  for (let i = 0; i < 120; i++) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const done = countDone(history, habitId, monthDates(localDate(first)))
    if (done >= goal) streak++
    else if (i === 0) continue
    else break
  }
  return streak
}

export const habitStreak = (habit: Habit, history: HabitHistory, now = new Date()): number =>
  habitCadence(habit) === 'monthly'
    ? monthlyStreak(history, habit.id, habitGoal(habit), now)
    : dailyStreak(history, habit.id, now)
