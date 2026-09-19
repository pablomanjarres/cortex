import type { ReactNode } from 'react'
import { CalendarDays, CheckCircle2, ClipboardList, TimerReset } from 'lucide-react'
import type { Assignment } from '@/features/student/student-types'
import type { HomeCalendarEvent } from '../home-model'

export type CalendarState = 'loading' | 'ready' | 'error' | 'empty'

export interface FactItem {
  label: string
  value: ReactNode
  detail: string
  tone: 'focus' | 'habit' | 'deadline' | 'calendar'
  icon: ReactNode
}

export interface HabitChip {
  id: string
  name: string
  emoji: string
  done: boolean
  onToggle: () => void
}

export const dayName = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })

export const dayNumber = (day: string) => String(new Date(`${day}T12:00:00`).getDate())

export const shortTime = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const formatMinutes = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m` : ''}`.trim() : `${minutes}m`

export const assignmentDay = (assignment: Assignment) => assignment.deadline?.slice(0, 10)

export const eventDay = (event: HomeCalendarEvent) => event.startDate.slice(0, 10)

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

export function buildFacts({
  focusMinutes,
  habitsDone,
  habitsTotal,
  openAssignments,
  calendarState,
  eventCount,
}: {
  focusMinutes: number
  habitsDone: number
  habitsTotal: number
  openAssignments: number
  calendarState: CalendarState
  eventCount: number
}): FactItem[] {
  const calendarValue = calendarState === 'loading' ? '...' : calendarState === 'error' ? 'Check' : eventCount
  const calendarDetail = calendarState === 'error'
    ? '7-day Calendar read failed'
    : calendarState === 'loading'
      ? 'Loading next 7 days'
      : 'Events in next 7 days'

  return [
    { label: 'Deep work', value: formatMinutes(focusMinutes), detail: 'Completed today', tone: 'focus', icon: <TimerReset /> },
    { label: 'Habits', value: `${habitsDone}/${habitsTotal}`, detail: 'Active habits today', tone: 'habit', icon: <CheckCircle2 /> },
    { label: 'Open work', value: openAssignments, detail: 'Student assignments', tone: 'deadline', icon: <ClipboardList /> },
    { label: 'Schedule', value: calendarValue, detail: calendarDetail, tone: 'calendar', icon: <CalendarDays /> },
  ]
}

export const homeCalendarState = (loading: boolean, error: string | null, events: HomeCalendarEvent[]): CalendarState => {
  if (loading) return 'loading'
  if (error) return 'error'
  if (events.length === 0) return 'empty'
  return 'ready'
}
