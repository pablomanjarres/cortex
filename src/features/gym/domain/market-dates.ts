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
