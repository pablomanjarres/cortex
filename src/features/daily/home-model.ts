import type { SprintSession } from '../../lib/sprint-context'
import type { Assignment } from '../student/student-types'

const formatLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const parseDateOnly = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

export function weekDates(anchor: Date): string[] {
  const day = anchor.getDay()
  const monday = new Date(anchor)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(anchor.getDate() - ((day + 6) % 7))

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return formatLocalDate(date)
  })
}

export function weeklyFocusMinutes(days: string[], sessionsByDay: Record<string, SprintSession[]>): number[] {
  return days.map((day) =>
    (sessionsByDay[day] ?? []).reduce((sum, session) => {
      const duration = Number(session.duration)
      return Number.isFinite(duration) ? sum + duration : sum
    }, 0),
  )
}

export function activeHabitSummary(
  habits: Array<{ id: string; onHold?: boolean }>,
  completed: Record<string, boolean>,
): { done: number; total: number } {
  const active = habits.filter((habit) => !habit.onHold)
  return {
    done: active.filter((habit) => completed[habit.id] === true).length,
    total: active.length,
  }
}

export function upcomingAssignments(assignments: Assignment[], now: Date): Assignment[] {
  const today = formatLocalDate(now)
  return assignments
    .map((assignment, index) => ({ assignment, index }))
    .filter(({ assignment }) =>
      !assignment.done &&
      typeof assignment.deadline === 'string' &&
      parseDateOnly(assignment.deadline) !== null &&
      assignment.deadline >= today,
    )
    .sort((a, b) => a.assignment.deadline!.localeCompare(b.assignment.deadline!) || a.index - b.index)
    .map(({ assignment }) => assignment)
}
