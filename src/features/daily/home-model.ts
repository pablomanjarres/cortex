import type { SprintSession } from '../../lib/sprint-context'
import type { Assignment } from '../student/student-types'

export interface HomeCalendarEvent {
  id?: string
  title: string
  startDate: string
  endDate?: string
  calendar: string
  isAllDay: boolean
}

export type UpNextItem =
  | {
    kind: 'event'
    id: string
    title: string
    source: string
    startsAt: Date
    endsAt: Date | null
    isAllDay: boolean
  }
  | {
    kind: 'deadline'
    id: string
    title: string
    source: string
    startsAt: Date
    endsAt: null
    assignment: Assignment
  }

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

const endOfDateOnly = (value: string): Date | null => {
  const date = parseDateOnly(value)
  if (!date) return null
  date.setHours(23, 59, 59, 999)
  return date
}

const parseEventStart = (value: string | undefined, isAllDay: boolean): Date | null => {
  if (!value) return null
  const dateOnly = parseDateOnly(value.slice(0, 10))
  if (isAllDay && dateOnly) return dateOnly
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parseEventEnd = (event: HomeCalendarEvent): Date | null => {
  if (event.isAllDay) {
    const end = parseDateOnly((event.endDate || event.startDate).slice(0, 10))
    if (!end) return null
    if (!event.endDate) end.setDate(end.getDate() + 1)
    end.setMilliseconds(end.getMilliseconds() - 1)
    return end
  }
  const rawEnd = event.endDate ? new Date(event.endDate) : null
  if (rawEnd && !Number.isNaN(rawEnd.getTime())) return rawEnd
  return parseEventStart(event.startDate, false)
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

export function overdueAssignments(assignments: Assignment[], now: Date): Assignment[] {
  const today = formatLocalDate(now)
  return assignments
    .map((assignment, index) => ({ assignment, index }))
    .filter(({ assignment }) =>
      !assignment.done &&
      typeof assignment.deadline === 'string' &&
      parseDateOnly(assignment.deadline) !== null &&
      assignment.deadline < today,
    )
    .sort((a, b) => a.assignment.deadline!.localeCompare(b.assignment.deadline!) || a.index - b.index)
    .map(({ assignment }) => assignment)
}

export function upNextItems({
  events,
  assignments,
  courseNames,
  now,
  limit = 8,
}: {
  events: HomeCalendarEvent[]
  assignments: Assignment[]
  courseNames: Map<string, string>
  now: Date
  limit?: number
}): UpNextItem[] {
  const eventItems: UpNextItem[] = events.flatMap((event) => {
    const startsAt = parseEventStart(event.startDate, event.isAllDay)
    const endsAt = parseEventEnd(event)
    if (!startsAt || !endsAt || endsAt.getTime() <= now.getTime()) return []
    return [{
      kind: 'event',
      id: event.id || `${event.title}-${event.startDate}`,
      title: event.title || 'Untitled event',
      source: event.calendar || 'Calendar',
      startsAt,
      endsAt,
      isAllDay: event.isAllDay,
    }]
  })

  const deadlineItems: UpNextItem[] = upcomingAssignments(assignments, now).flatMap((assignment) => {
    const startsAt = endOfDateOnly(assignment.deadline!)
    if (!startsAt) return []
    return [{
      kind: 'deadline',
      id: assignment.id,
      title: assignment.name || 'Untitled assignment',
      source: courseNames.get(assignment.courseId) || assignment.courseId || 'Student',
      startsAt,
      endsAt: null,
      assignment,
    }]
  })

  return [...eventItems, ...deadlineItems]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.title.localeCompare(b.title))
    .slice(0, limit)
}
