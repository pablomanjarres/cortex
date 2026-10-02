import { iso, type WorkHoursState, type WorkProject } from './work-hours-types.js'

export function billingPeriod(now: string, cycleDay: number, timeZone: string): { start: string; end: string } {
  const at = Date.parse(iso(now))
  const format = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
  const key = (ms: number): string => {
    const parts = format.formatToParts(ms)
    const get = (name: string) => Number(parts.find((part) => part.type === name)?.value)
    const month = new Date(Date.UTC(get('year'), get('month') - 1 - (get('day') < cycleDay ? 1 : 0), 1))
    return month.toISOString().slice(0, 7)
  }
  const current = key(at)
  const find = (before: number, after: number, starting: boolean): number => {
    while (before + 1 < after) {
      const mid = Math.floor((before + after) / 2)
      if ((key(mid) === current) === starting) after = mid
      else before = mid
    }
    return after
  }
  return {
    start: new Date(find(at - 40 * 86400000, at, true)).toISOString(),
    end: new Date(find(at, at + 40 * 86400000, false)).toISOString(),
  }
}

/** Allocate included time once across all qualifying work in each billing cycle. */
export function chargeableWork(state: Pick<WorkHoursState, 'sessions'>, project: WorkProject): Map<string, number> {
  const charges = new Map<string, number>()
  const policy = project.billing
  const consumed = new Map<string, number>()
  let currentPeriod: { start: string; end: string } | undefined
  const rows = state.sessions.filter((row) => row.projectId === project.id && row.billable && !row.needsReview)
    .slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const row of rows) {
    if (!policy) { charges.set(row.id, row.durationMs); continue }
    let start = Date.parse(row.startedAt)
    const end = Date.parse(row.endedAt)
    let charged = 0
    while (start < end) {
      const date = new Date(start).toISOString()
      const period = currentPeriod && start >= Date.parse(currentPeriod.start) && start < Date.parse(currentPeriod.end)
        ? currentPeriod : billingPeriod(date, policy.cycleDay, policy.timeZone)
      currentPeriod = period
      const stop = Math.min(end, Date.parse(period.end))
      const duration = stop - start
      const used = consumed.get(period.start) ?? 0
      charged += Math.max(0, used + duration - policy.includedHours * 3600000) - Math.max(0, used - policy.includedHours * 3600000)
      consumed.set(period.start, used + duration)
      start = stop
    }
    charges.set(row.id, charged)
  }
  return charges
}

export function billingCycleSummary(state: WorkHoursState, project: WorkProject, now: string) {
  const policy = project.billing ?? { includedHours: 0, cycleDay: 1, timeZone: 'America/Bogota' }
  const period = billingPeriod(now, policy.cycleDay, policy.timeZone)
  const start = Date.parse(period.start), end = Date.parse(period.end)
  const sessions = state.sessions.filter((row) => row.projectId === project.id && row.billable && !row.needsReview)
    .flatMap((row) => {
      const from = Math.max(start, Date.parse(row.startedAt)), to = Math.min(end, Date.parse(row.endedAt))
      return to > from ? [{ ...row, startedAt: new Date(from).toISOString(), endedAt: new Date(to).toISOString(), durationMs: to - from }] : []
    })
  const qualifyingMs = sessions.reduce((sum, row) => sum + row.durationMs, 0)
  const chargeableMs = [...chargeableWork({ ...state, sessions }, project).values()].reduce((sum, value) => sum + value, 0)
  return { ...period, qualifyingMs, chargeableMs, remainingMs: Math.max(0, policy.includedHours * 3600000 - qualifyingMs) }
}
