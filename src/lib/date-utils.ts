/** Get the last N days as YYYY-MM-DD strings, ending at `from` (defaults to today) */
export function getLastNDays(n: number, from?: string): string[] {
  const end = from ? new Date(from + 'T00:00:00') : new Date()
  const days: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(end.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

/** Get Mon-Sun dates for the week containing the given date */
export function getWeekDates(isoDate: string): string[] {
  const d = new Date(isoDate + 'T00:00:00')
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7))
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const wd = new Date(monday)
    wd.setDate(monday.getDate() + i)
    dates.push(wd.toISOString().slice(0, 10))
  }
  return dates
}

/** Human-readable week label, e.g. "Mar 17 – Mar 23" */
export function getWeekLabel(startDate: string): string {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

/** ISO week ID, e.g. "2026-W12" */
export function getISOWeek(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

/** Human-readable relative time, e.g. "2h ago", "5m ago" */
export function timeAgo(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Format minutes to human readable: "2h 15m" or "45m" */
export function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${mins}m`
}
