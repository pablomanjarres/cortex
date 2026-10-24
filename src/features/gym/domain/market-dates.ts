import { localDate } from '@/lib/date-utils'

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DAY_MS = 86_400_000

/** Short label for an ISO timestamp, counted in local calendar days before `today` (YYYY-MM-DD). */
export function relativeMarketDate(iso: string, today: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const day = new Date(`${localDate(d)}T12:00:00`)
  const diffDays = Math.round((new Date(`${today}T12:00:00`).getTime() - day.getTime()) / DAY_MS)
  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** Monday dates of every week that overlaps the given month. */
export function weeksInMonth(year: number, month: number): string[] {
  const weeks: string[] = []
  const d = new Date(year, month, 1)
  // Go to the Monday of the week containing the 1st
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7))
  while (true) {
    const weekStart = localDate(d)
    // Include this week if any day falls in our target month
    const weekEnd = new Date(d)
    weekEnd.setDate(d.getDate() + 6)
    if (d.getMonth() > month && d.getFullYear() >= year) break
    if (weekEnd.getMonth() >= month || weekEnd.getFullYear() > year || d.getMonth() === month || weekEnd.getMonth() === month) {
      weeks.push(weekStart)
    }
    d.setDate(d.getDate() + 7)
    if (weeks.length > 6) break // safety
  }
  return weeks
}

/** Market week label, e.g. "17 Mar – 23 Mar". */
export function marketWeekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return `${fmt(start)} – ${fmt(end)}`
}
