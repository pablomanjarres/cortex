import type { ReactNode } from 'react'
import { CalendarDays, CheckCircle2, ClipboardList, TimerReset } from 'lucide-react'
import type { Assignment } from '@/features/student/student-types'
import type { HomeCalendarEvent } from '../home-model'

export type CalendarState = 'loading' | 'ready' | 'error' | 'empty' | 'ambiguous'

export interface WorkBreakdown {
  overdue: number
  thisWeek: number
  later: number
  undated: number
}

export type FactVisual =
  | { kind: 'bars'; days: string[]; values: number[]; unit: 'minutes' | 'events' }
  | { kind: 'habits'; done: number; total: number }
  | { kind: 'work'; breakdown: WorkBreakdown }
  | { kind: 'unavailable'; message: string }

export interface FactItem {
  label: string
  value: ReactNode
  detail: string
  tone: 'focus' | 'habit' | 'deadline' | 'calendar'
  icon: ReactNode
  visual: FactVisual
}

export interface HabitChip {
  id: string
  name: string
  emoji: string
  done: boolean
  onToggle: () => void
}

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

const localDateTime = (day: string, time: string) => new Date(`${day}T${time}`)

const parseCalendarDate = (value: string) => {
  if (dateOnlyPattern.test(value)) return localDateTime(value, '00:00:00')
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const dayName = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })

export const dayNumber = (day: string) => String(new Date(`${day}T12:00:00`).getDate())

export const shortTime = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const dueDateLabel = (day: string) =>
  `Due ${new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

export const formatMinutes = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m` : ''}`.trim() : `${minutes}m`

export const assignmentDay = (assignment: Assignment) => assignment.deadline?.slice(0, 10)

const validLocalDay = (day: string | undefined) => {
  if (!day || !dateOnlyPattern.test(day)) return false
  const date = new Date(`${day}T12:00:00`)
  return !Number.isNaN(date.getTime()) &&
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` === day
}

export function openWorkBreakdown(assignments: Assignment[], today: string, weekEnd: string): WorkBreakdown {
  const breakdown = { overdue: 0, thisWeek: 0, later: 0, undated: 0 }
  for (const assignment of assignments) {
    if (assignment.done) continue
    const day = assignmentDay(assignment)
    if (!validLocalDay(day)) breakdown.undated++
    else if (day! < today) breakdown.overdue++
    else if (day! <= weekEnd) breakdown.thisWeek++
    else breakdown.later++
  }
  return breakdown
}

export const eventDay = (event: HomeCalendarEvent) => {
  const start = parseCalendarDate(event.startDate)
  if (!start) return event.startDate.slice(0, 10)
  const month = String(start.getMonth() + 1).padStart(2, '0')
  const day = String(start.getDate()).padStart(2, '0')
  return `${start.getFullYear()}-${month}-${day}`
}

export const eventOverlapsDay = (event: HomeCalendarEvent, day: string) => {
  const start = parseCalendarDate(event.startDate)
  if (!start) return false

  const dayStart = localDateTime(day, '00:00:00')
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)

  const parsedEnd = event.endDate ? parseCalendarDate(event.endDate) : null
  const end = parsedEnd && parsedEnd > start
    ? parsedEnd
    : new Date(start.getTime() + (event.isAllDay ? 24 * 60 * 60 * 1000 : 1))

  return start < nextDay && end > dayStart
}

export const weeklyEventCounts = (days: string[], events: HomeCalendarEvent[]) =>
  days.map((day) => events.filter((event) => eventOverlapsDay(event, day)).length)

export const weekRangeLabel = (days: string[]) => {
  if (days.length === 0) return ''
  const start = new Date(`${days[0]}T12:00:00`)
  const end = new Date(`${days[days.length - 1]}T12:00:00`)
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
  const startDay = start.getDate()
  const endDay = end.getDate()
  return startMonth === endMonth ? `${startMonth} ${startDay}-${endDay}` : `${startMonth} ${startDay}-${endMonth} ${endDay}`
}

export const calendarDetailForState = (state: CalendarState) =>
  state === 'error'
    ? 'This week’s Calendar read failed'
    : state === 'loading'
      ? 'Loading this week'
      : state === 'ambiguous'
        ? 'Calendar access needs checking'
        : 'Events this week'

export function buildFacts({
  focusMinutes,
  focusWeekMinutes,
  weekDays,
  today,
  habitsDone,
  habitsTotal,
  assignments,
  calendarState,
  calendarEvents,
}: {
  focusMinutes: number
  focusWeekMinutes: number[]
  weekDays: string[]
  today: string
  habitsDone: number
  habitsTotal: number
  assignments: Assignment[]
  calendarState: CalendarState
  calendarEvents: HomeCalendarEvent[]
}): FactItem[] {
  const calendarValue = calendarState === 'loading' || calendarState === 'error' || calendarState === 'ambiguous' ? 'Check' : calendarEvents.length
  const calendarDetail = calendarDetailForState(calendarState)
  const work = openWorkBreakdown(assignments, today, weekDays[weekDays.length - 1])
  const openAssignments = work.overdue + work.thisWeek + work.later + work.undated

  return [
    { label: 'Deep work', value: formatMinutes(focusMinutes), detail: 'Completed today', tone: 'focus', icon: <TimerReset />, visual: { kind: 'bars', days: weekDays, values: focusWeekMinutes, unit: 'minutes' } },
    { label: 'Habits', value: `${habitsDone}/${habitsTotal}`, detail: 'Active habits today', tone: 'habit', icon: <CheckCircle2 />, visual: { kind: 'habits', done: habitsDone, total: habitsTotal } },
    { label: 'Open work', value: openAssignments, detail: 'Student assignments', tone: 'deadline', icon: <ClipboardList />, visual: { kind: 'work', breakdown: work } },
    { label: 'Schedule', value: calendarValue, detail: calendarDetail, tone: 'calendar', icon: <CalendarDays />, visual: calendarState === 'ready' ? { kind: 'bars', days: weekDays, values: weeklyEventCounts(weekDays, calendarEvents), unit: 'events' } : { kind: 'unavailable', message: 'Calendar chart unavailable' } },
  ]
}

export function buildShortcutHabits<T extends { id: string; name: string; emoji: string; onHold?: boolean }>(
  habits: T[],
  isCompleted: (habitId: string) => boolean,
  toggle: (habitId: string) => void,
): HabitChip[] {
  return habits
    .filter((habit) => !habit.onHold)
    .map((habit) => ({
      id: habit.id,
      name: habit.name,
      emoji: habit.emoji,
      done: isCompleted(habit.id),
      onToggle: () => toggle(habit.id),
    }))
}

export const homeCalendarState = (
  loading: boolean,
  error: string | null,
  events: HomeCalendarEvent[],
): CalendarState => {
  if (loading) return 'loading'
  if (error) return 'error'
  if (events.length === 0) return 'ambiguous'
  return 'ready'
}
