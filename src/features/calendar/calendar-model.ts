export interface CalendarEventLike {
  id?: string
  title: string
  startDate: string
  endDate?: string
  calendar: string
  isAllDay: boolean
}

export interface CalendarDayGroup<T extends CalendarEventLike = CalendarEventLike> {
  date: string
  allDay: T[]
  timed: T[]
}

export const formatLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function weekDates(anchor: Date): string[] {
  const monday = new Date(anchor)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return formatLocalDate(date)
  })
}

export function addDays(date: string, days: number): string {
  const next = parseDateOnly(date)
  if (!next) return date
  next.setDate(next.getDate() + days)
  return formatLocalDate(next)
}

export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return formatLocalDate(date) === value ? date : null
}

const isDateOnly = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)

const localDayFromCalendarValue = (value: string | undefined): string | null => {
  if (!value) return null
  if (isDateOnly(value)) return parseDateOnly(value) ? value : null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : formatLocalDate(date)
}

export function parseEventStart(event: CalendarEventLike): Date | null {
  if (event.isAllDay) {
    const startDay = localDayFromCalendarValue(event.startDate)
    return startDay ? parseDateOnly(startDay) : null
  }
  const start = new Date(event.startDate)
  return Number.isNaN(start.getTime()) ? null : start
}

export function parseEventEnd(event: CalendarEventLike): Date | null {
  if (event.isAllDay) {
    const startDay = localDayFromCalendarValue(event.startDate)
    if (!startDay) return null
    if (!event.endDate) return parseDateOnly(addDays(startDay, 1))
    if (isDateOnly(event.endDate)) return parseDateOnly(event.endDate)
    const inclusiveEndDay = localDayFromCalendarValue(event.endDate)
    return inclusiveEndDay ? parseDateOnly(addDays(inclusiveEndDay, 1)) : null
  }
  const end = event.endDate ? new Date(event.endDate) : null
  if (end && !Number.isNaN(end.getTime())) return end
  return parseEventStart(event)
}

export function eventOverlapsDay(event: CalendarEventLike, date: string): boolean {
  const dayStart = parseDateOnly(date)
  const start = parseEventStart(event)
  const end = parseEventEnd(event)
  if (!dayStart || !start || !end) return false
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  return start.getTime() < dayEnd.getTime() && end.getTime() > dayStart.getTime()
}

export function groupCalendarDays<T extends CalendarEventLike>(
  events: T[],
  dates: string[],
): CalendarDayGroup<T>[] {
  const sorted = [...events].sort((a, b) => {
    const aStart = parseEventStart(a)?.getTime() ?? Number.POSITIVE_INFINITY
    const bStart = parseEventStart(b)?.getTime() ?? Number.POSITIVE_INFINITY
    return aStart - bStart || (a.title || '').localeCompare(b.title || '')
  })

  return dates.map((date) => ({
    date,
    allDay: sorted.filter((event) => event.isAllDay && eventOverlapsDay(event, date)),
    timed: sorted.filter((event) => !event.isAllDay && eventOverlapsDay(event, date)),
  }))
}
