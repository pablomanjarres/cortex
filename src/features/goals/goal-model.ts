import { localDate } from '@/lib/date-utils'

// Goal records and the rules shared by the goal list, card, and editor.

export type GoalStatus = 'active' | 'done' | 'archived'

export interface Milestone {
  id: string
  title: string
  done: boolean
}

export interface Goal {
  id: string
  title: string
  detail?: string // the "why" / notes
  area?: string // life area, free-text like habit categories
  period?: string // "2026" | "2026-Q3" | "2026-07" — drives the timeframe view
  targetDate?: string // YYYY-MM-DD — drives the deadline view + overdue flagging
  progress?: number // 0–100, used only when a goal has no milestones
  milestones?: Milestone[] // when present, progress = done/total
  status: GoalStatus
  createdAt: string
  completedAt?: string
}

export type GoalView = 'area' | 'timeframe' | 'deadline'

export function goalUid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// A goal's progress: 100 when explicitly done, else derived from milestones
// when it has any, else the manual percent (default 0).
export function goalProgress(g: Goal): number {
  if (g.status === 'done') return 100
  if (g.milestones && g.milestones.length > 0) {
    const done = g.milestones.filter((m) => m.done).length
    return Math.round((done / g.milestones.length) * 100)
  }
  return Math.min(Math.max(g.progress ?? 0, 0), 100)
}

export function isOverdue(g: Goal, today = localDate()): boolean {
  return (
    g.status === 'active' &&
    !!g.targetDate &&
    g.targetDate < today &&
    goalProgress(g) < 100
  )
}

export function formatTargetDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Sort goals within a group: overdue first, then active before done, then by
// target date (soonest first, undated last), then newest.
function sortGoals(a: Goal, b: Goal, today: string): number {
  const ao = isOverdue(a, today) ? 0 : 1
  const bo = isOverdue(b, today) ? 0 : 1
  if (ao !== bo) return ao - bo
  const ad = a.status === 'done' ? 1 : 0
  const bd = b.status === 'done' ? 1 : 0
  if (ad !== bd) return ad - bd
  const at = a.targetDate ?? '9999-99-99'
  const bt = b.targetDate ?? '9999-99-99'
  if (at !== bt) return at < bt ? -1 : 1
  return b.createdAt.localeCompare(a.createdAt)
}

/** Ordered [groupLabel, goals] pairs for a view; the deadline view is one unlabelled group. */
export function groupGoals(goals: ReadonlyArray<Goal>, view: GoalView, today = localDate()): Array<[string, Goal[]]> {
  const byPriority = (a: Goal, b: Goal) => sortGoals(a, b, today)
  if (view === 'deadline') return [['', [...goals].sort(byPriority)]]
  const emptyLabel = view === 'area' ? 'Uncategorized' : 'No timeframe'
  const map = new Map<string, Goal[]>()
  for (const g of goals) {
    const k = (view === 'area' ? g.area : g.period) || emptyLabel
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(g)
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === emptyLabel) return 1
    if (b === emptyLabel) return -1
    return a.localeCompare(b)
  })
  return keys.map((k) => [k, map.get(k)!.sort(byPriority)])
}

/** Editable goal fields as typed; blank optional fields clear on save. */
export interface GoalDraft {
  title: string
  detail: string
  area: string
  period: string
  targetDate: string
  progress: string
  status: GoalStatus
}

export const emptyGoalDraft = (): GoalDraft => ({
  title: '', detail: '', area: '', period: '', targetDate: '', progress: '0', status: 'active',
})

export function goalDraft(g: Goal): GoalDraft {
  return {
    title: g.title,
    detail: g.detail ?? '',
    area: g.area ?? '',
    period: g.period ?? '',
    targetDate: g.targetDate ?? '',
    progress: String(g.progress ?? 0),
    status: g.status,
  }
}

/** A new active goal from the add form, or null when the title is blank. */
export function createGoal(draft: Pick<GoalDraft, 'title' | 'area' | 'period' | 'targetDate'>, now = new Date()): Goal | null {
  const title = draft.title.trim()
  if (!title) return null
  const area = draft.area.trim()
  const period = draft.period.trim()
  return {
    id: goalUid('goal'),
    title,
    status: 'active',
    createdAt: now.toISOString(),
    progress: 0,
    ...(area ? { area } : {}),
    ...(period ? { period } : {}),
    ...(draft.targetDate ? { targetDate: draft.targetDate } : {}),
  }
}

/** Apply an edited draft, keeping completion time in step with the status. */
export function applyGoalDraft(g: Goal, draft: GoalDraft, now = new Date()): Goal {
  const next: Goal = {
    ...g,
    title: draft.title.trim(),
    status: draft.status,
    detail: draft.detail.trim() || undefined,
    area: draft.area.trim() || undefined,
    period: draft.period.trim() || undefined,
    targetDate: draft.targetDate || undefined,
  }
  // Manual progress only matters when there are no milestones.
  if (!g.milestones || g.milestones.length === 0) {
    const p = parseInt(draft.progress, 10)
    next.progress = Number.isNaN(p) ? 0 : Math.min(Math.max(p, 0), 100)
  }
  if (draft.status === 'done' && !g.completedAt) next.completedAt = now.toISOString()
  if (draft.status !== 'done') next.completedAt = undefined
  return next
}
