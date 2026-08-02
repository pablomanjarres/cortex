// Class-deadline alerts.
//
// Watches `cortex-student-assignments` and pushes a Pushover reminder as each
// undone assignment crosses a lead-time threshold (default: 7d, 3d, 1d, day-of).
// Runs in main so it fires whether or not the window is open.
//
// Delivery rules that keep it from being annoying:
//  - Every (assignment, threshold) pair fires at most once. Firing is recorded
//    in the config's `sent` map, which is pruned when an assignment is
//    completed or deleted.
//  - If the app was closed through a threshold, the missed thresholds are
//    marked sent but only ONE push goes out, naming the real days remaining.
//  - Everything due in the same check is batched into a single push.
//  - Nothing fires outside waking hours; the check simply returns and retries
//    on the next tick, so no threshold is silently consumed.
//  - Overdue work never pushes (the Daily widget still surfaces it) — a missed
//    deadline can't be un-missed, and repeating the push would be nagging.

export const DEADLINE_ALERTS_KEY = 'cortex-deadline-alerts'
const ASSIGNMENTS_KEY = 'cortex-student-assignments'
const COURSES_KEY = 'cortex-student-courses'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // hourly
const STARTUP_DELAY_MS = 20_000          // let the app settle before the first check

export interface DeadlineAlertConfig {
  enabled: boolean
  /** Days-before-deadline that earn a push. Descending, deduped, >= 0. */
  leadDays: number[]
  /** Local hours a push may fire in: [quietBefore, quietAfter). */
  quietBefore: number
  quietAfter: number
  /** "<assignmentId>:<leadDay>" -> ISO timestamp it fired. */
  sent: Record<string, string>
}

export const DEFAULT_DEADLINE_ALERTS: DeadlineAlertConfig = {
  enabled: true,
  leadDays: [7, 3, 1, 0],
  quietBefore: 8,
  quietAfter: 23,
  sent: {},
}

/** Only the fields this module reads — the full shapes live in student-types.ts. */
interface AssignmentLike {
  id?: string
  name?: string
  courseId?: string
  deadline?: string
  done?: boolean
}
interface CourseLike { id?: string; name?: string }

export interface DeadlineAlertDeps {
  readDataKeyParsed<T>(key: string, fallback: T): Promise<T>
  writeDataKey(key: string, data: unknown, opts: { source: 'main' }): Promise<{ ok: boolean }>
  /** Fires the push. Lives in main so this module stays free of child_process. */
  push(opts: { title: string; message: string; priority: 0 | 1 }): void
}

export interface DeadlineCheckResult {
  scanned: number
  pushed: number
  /** Set when the run bailed early; no thresholds were consumed. */
  skipped?: 'disabled' | 'quiet-hours' | 'no-assignments'
}

/** Local YYYY-MM-DD (avoids the UTC shift toISOString would introduce). */
function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Whole days from `todayISO` to `deadlineISO`. Negative once overdue. */
export function daysUntil(todayISO: string, deadlineISO: string): number {
  // Parsed at local midnight on both ends so DST never rounds a day away.
  const from = Date.parse(`${todayISO}T00:00:00`)
  const to = Date.parse(`${String(deadlineISO).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(from) || Number.isNaN(to)) return NaN
  return Math.round((to - from) / 86_400_000)
}

function label(days: number): string {
  if (days <= 0) return 'TODAY'
  if (days === 1) return 'tomorrow'
  return `${days} days`
}

function clampHour(v: unknown, fallback: number): number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 24 ? (v as number) : fallback
}

/** Persisted config is user-editable (MCP write_data), so never trust its shape. */
export function normalizeConfig(raw: Partial<DeadlineAlertConfig> | null | undefined): DeadlineAlertConfig {
  const d = DEFAULT_DEADLINE_ALERTS
  const leads = Array.isArray(raw?.leadDays)
    ? [...new Set(raw!.leadDays.filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => b - a)
    : []
  const quietBefore = clampHour(raw?.quietBefore, d.quietBefore)
  const quietAfter = clampHour(raw?.quietAfter, d.quietAfter)
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : d.enabled,
    leadDays: leads.length ? leads : d.leadDays,
    // An inverted window would mute alerts forever — fall back instead.
    ...(quietBefore < quietAfter ? { quietBefore, quietAfter } : { quietBefore: d.quietBefore, quietAfter: d.quietAfter }),
    sent: raw?.sent && typeof raw.sent === 'object' && !Array.isArray(raw.sent) ? { ...raw.sent } : {},
  }
}

export async function runDeadlineCheck(deps: DeadlineAlertDeps, now: Date = new Date()): Promise<DeadlineCheckResult> {
  const cfg = normalizeConfig(await deps.readDataKeyParsed<Partial<DeadlineAlertConfig>>(DEADLINE_ALERTS_KEY, DEFAULT_DEADLINE_ALERTS))
  if (!cfg.enabled) return { scanned: 0, pushed: 0, skipped: 'disabled' }

  const hour = now.getHours()
  if (hour < cfg.quietBefore || hour >= cfg.quietAfter) return { scanned: 0, pushed: 0, skipped: 'quiet-hours' }

  const assignments = await deps.readDataKeyParsed<AssignmentLike[]>(ASSIGNMENTS_KEY, [])
  if (!Array.isArray(assignments) || assignments.length === 0) return { scanned: 0, pushed: 0, skipped: 'no-assignments' }

  const courses = await deps.readDataKeyParsed<CourseLike[]>(COURSES_KEY, [])
  const courseName = new Map(
    (Array.isArray(courses) ? courses : []).filter((c) => c?.id).map((c) => [c.id as string, c.name || (c.id as string)])
  )

  const today = localDate(now)
  const sent = { ...cfg.sent }
  const due: { left: number; name: string; course: string }[] = []
  let dirty = false

  for (const a of assignments) {
    if (!a?.id || !a.deadline || a.done) continue
    const left = daysUntil(today, a.deadline)
    if (!Number.isFinite(left) || left < 0) continue

    const crossed = cfg.leadDays.filter((t) => left <= t && !sent[`${a.id}:${t}`])
    if (crossed.length === 0) continue

    // Consume every threshold already passed, but announce once with the real
    // remaining time — so a week of downtime yields one push, not four.
    for (const t of crossed) { sent[`${a.id}:${t}`] = now.toISOString(); dirty = true }
    due.push({ left, name: a.name || 'Untitled', course: courseName.get(a.courseId || '') || a.courseId || '—' })
  }

  // Drop bookkeeping for assignments that are finished or gone, so completing
  // and re-opening one lets it alert again and the map can't grow forever.
  const live = new Set(assignments.filter((a) => a?.id && !a.done).map((a) => a.id as string))
  for (const key of Object.keys(sent)) {
    if (!live.has(key.slice(0, key.lastIndexOf(':')))) { delete sent[key]; dirty = true }
  }

  if (due.length > 0) {
    due.sort((x, y) => x.left - y.left || x.name.localeCompare(y.name))
    deps.push({
      title: due.length === 1 ? 'Deadline' : `${due.length} deadlines`,
      message: due.map((d) => `${label(d.left)} · ${d.course} — ${d.name}`).join('\n'),
      priority: due[0].left <= 1 ? 1 : 0,
    })
  }

  if (dirty) await deps.writeDataKey(DEADLINE_ALERTS_KEY, { ...cfg, sent }, { source: 'main' })
  return { scanned: assignments.length, pushed: due.length }
}

/** Starts the hourly loop. Returns a stop function. */
export function startDeadlineAlerts(deps: DeadlineAlertDeps): () => void {
  const tick = () => {
    runDeadlineCheck(deps).catch((e) => console.error('[Cortex] deadline check failed:', e))
  }
  const first = setTimeout(tick, STARTUP_DELAY_MS)
  const loop = setInterval(tick, CHECK_INTERVAL_MS)
  return () => { clearTimeout(first); clearInterval(loop) }
}
