import { useState } from 'react'
import { useStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import { PageShell } from '@/components/shared/PageShell'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Goal as GoalIcon,
  Plus,
  X,
  Pencil,
  Circle,
  CheckCircle2,
  Calendar,
  Archive,
  Target,
} from 'lucide-react'

// ─── Model ────────────────────────────────────────────────
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

type View = 'area' | 'timeframe' | 'deadline'

// ─── Helpers ──────────────────────────────────────────────
function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// A goal's progress: 100 when explicitly done, else derived from milestones
// when it has any, else the manual percent (default 0).
function goalProgress(g: Goal): number {
  if (g.status === 'done') return 100
  if (g.milestones && g.milestones.length > 0) {
    const done = g.milestones.filter((m) => m.done).length
    return Math.round((done / g.milestones.length) * 100)
  }
  return Math.min(Math.max(g.progress ?? 0, 0), 100)
}

function isOverdue(g: Goal): boolean {
  return (
    g.status === 'active' &&
    !!g.targetDate &&
    g.targetDate < localDate() &&
    goalProgress(g) < 100
  )
}

function formatTargetDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Sort goals within a group: overdue first, then active before done, then by
// target date (soonest first, undated last), then newest.
function sortGoals(a: Goal, b: Goal): number {
  const ao = isOverdue(a) ? 0 : 1
  const bo = isOverdue(b) ? 0 : 1
  if (ao !== bo) return ao - bo
  const ad = a.status === 'done' ? 1 : 0
  const bd = b.status === 'done' ? 1 : 0
  if (ad !== bd) return ad - bd
  const at = a.targetDate ?? '9999-99-99'
  const bt = b.targetDate ?? '9999-99-99'
  if (at !== bt) return at < bt ? -1 : 1
  return b.createdAt.localeCompare(a.createdAt)
}

export function GoalsPage() {
  const [goals, updateGoals] = useStore<Goal[]>('cortex-goals', [])
  const setGoals = (fn: (prev: Goal[]) => Goal[]) => updateGoals(fn)

  const [view, setView] = useState<View>('area')
  const [showArchived, setShowArchived] = useState(false)

  // Add-goal form
  const [newTitle, setNewTitle] = useState('')
  const [newArea, setNewArea] = useState('')
  const [newPeriod, setNewPeriod] = useState('')
  const [newTarget, setNewTarget] = useState('')

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDetail, setEditDetail] = useState('')
  const [editArea, setEditArea] = useState('')
  const [editPeriod, setEditPeriod] = useState('')
  const [editTarget, setEditTarget] = useState('')
  const [editProgress, setEditProgress] = useState('')
  const [editStatus, setEditStatus] = useState<GoalStatus>('active')

  // Per-card new-milestone draft
  const [msDraft, setMsDraft] = useState<Record<string, string>>({})

  const areas = [...new Set(goals.map((g) => g.area).filter(Boolean))] as string[]

  // ── Mutators ──
  const addGoal = () => {
    if (!newTitle.trim()) return
    const goal: Goal = {
      id: uid('goal'),
      title: newTitle.trim(),
      status: 'active',
      createdAt: new Date().toISOString(),
      progress: 0,
      ...(newArea.trim() ? { area: newArea.trim() } : {}),
      ...(newPeriod.trim() ? { period: newPeriod.trim() } : {}),
      ...(newTarget ? { targetDate: newTarget } : {}),
    }
    setGoals((prev) => [...prev, goal])
    setNewTitle('')
    setNewArea('')
    setNewPeriod('')
    setNewTarget('')
  }

  const patchGoal = (id: string, patch: Partial<Goal>) =>
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)))

  const removeGoal = (id: string) => setGoals((prev) => prev.filter((g) => g.id !== id))

  const toggleDone = (g: Goal) => {
    if (g.status === 'done') patchGoal(g.id, { status: 'active', completedAt: undefined })
    else patchGoal(g.id, { status: 'done', completedAt: new Date().toISOString() })
  }

  const startEdit = (g: Goal) => {
    setEditingId(g.id)
    setEditTitle(g.title)
    setEditDetail(g.detail ?? '')
    setEditArea(g.area ?? '')
    setEditPeriod(g.period ?? '')
    setEditTarget(g.targetDate ?? '')
    setEditProgress(String(g.progress ?? 0))
    setEditStatus(g.status)
  }

  const saveEdit = () => {
    if (!editingId || !editTitle.trim()) return
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== editingId) return g
        const next: Goal = {
          ...g,
          title: editTitle.trim(),
          status: editStatus,
          detail: editDetail.trim() || undefined,
          area: editArea.trim() || undefined,
          period: editPeriod.trim() || undefined,
          targetDate: editTarget || undefined,
        }
        // Manual progress only matters when there are no milestones.
        if (!g.milestones || g.milestones.length === 0) {
          const p = parseInt(editProgress, 10)
          next.progress = Number.isNaN(p) ? 0 : Math.min(Math.max(p, 0), 100)
        }
        if (editStatus === 'done' && !g.completedAt) next.completedAt = new Date().toISOString()
        if (editStatus !== 'done') next.completedAt = undefined
        return next
      })
    )
    setEditingId(null)
  }

  const addMilestone = (goalId: string) => {
    const title = (msDraft[goalId] ?? '').trim()
    if (!title) return
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, milestones: [...(g.milestones ?? []), { id: uid('ms'), title, done: false }] }
          : g
      )
    )
    setMsDraft((d) => ({ ...d, [goalId]: '' }))
  }

  const toggleMilestone = (goalId: string, mId: string) =>
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, milestones: (g.milestones ?? []).map((m) => (m.id === mId ? { ...m, done: !m.done } : m)) }
          : g
      )
    )

  const removeMilestone = (goalId: string, mId: string) =>
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId ? { ...g, milestones: (g.milestones ?? []).filter((m) => m.id !== mId) } : g
      )
    )

  // ── Derived: visible goals + grouping ──
  const visible = goals.filter((g) => (showArchived ? true : g.status !== 'archived'))
  const activeGoals = goals.filter((g) => g.status === 'active')
  const doneCount = goals.filter((g) => g.status === 'done').length
  const avgProgress =
    activeGoals.length > 0
      ? Math.round(activeGoals.reduce((s, g) => s + goalProgress(g), 0) / activeGoals.length)
      : 0

  // Returns ordered [groupLabel, goals][] for the current view.
  const groups: Array<[string, Goal[]]> = (() => {
    if (view === 'deadline') {
      return [['', [...visible].sort(sortGoals)]]
    }
    const keyOf = (g: Goal) =>
      view === 'area' ? g.area || 'Uncategorized' : g.period || 'No timeframe'
    const emptyLabel = view === 'area' ? 'Uncategorized' : 'No timeframe'
    const map = new Map<string, Goal[]>()
    for (const g of visible) {
      const k = keyOf(g)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(g)
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === emptyLabel) return 1
      if (b === emptyLabel) return -1
      return a.localeCompare(b)
    })
    return keys.map((k) => [k, map.get(k)!.sort(sortGoals)] as [string, Goal[]])
  })()

  const views: Array<{ id: View; label: string }> = [
    { id: 'area', label: 'By Area' },
    { id: 'timeframe', label: 'By Timeframe' },
    { id: 'deadline', label: 'By Deadline' },
  ]

  // ── Goal card ──
  const renderGoal = (g: Goal) => {
    const pct = goalProgress(g)
    const isDone = g.status === 'done'
    const overdue = isOverdue(g)
    const milestones = g.milestones ?? []

    if (editingId === g.id) {
      return (
        <div key={g.id} className="surface rounded-xl p-4">
          <div className="flex flex-col gap-2">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} className="h-9 bg-input" placeholder="Goal title" autoFocus />
            <textarea
              value={editDetail}
              onChange={(e) => setEditDetail(e.target.value)}
              placeholder="Why this matters / notes…"
              className="min-h-[56px] w-full resize-y rounded-md border border-border bg-input px-2.5 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/30"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input value={editArea} onChange={(e) => setEditArea(e.target.value)} placeholder="Area" className="h-8 w-32 bg-input text-sm" list="goal-areas" />
              <Input value={editPeriod} onChange={(e) => setEditPeriod(e.target.value)} placeholder="2026-Q3" className="h-8 w-28 bg-input text-sm" />
              <input type="date" value={editTarget} onChange={(e) => setEditTarget(e.target.value)} className="h-8 rounded-md border border-border bg-input px-2 text-sm text-foreground" />
              {milestones.length === 0 && (
                <div className="flex items-center gap-1">
                  <Input value={editProgress} onChange={(e) => setEditProgress(e.target.value)} type="number" min={0} max={100} className="h-8 w-16 bg-input px-1 text-center text-sm" title="Progress %" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              )}
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as GoalStatus)} className="h-8 rounded-md border border-border bg-input px-2 text-sm text-foreground">
                <option value="active">Active</option>
                <option value="done">Done</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveEdit} className="h-8 flex-1 rounded-lg bg-foreground/10 text-sm font-medium hover:bg-foreground/15 transition-colors">Save</button>
              <button onClick={() => setEditingId(null)} className="h-8 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div key={g.id} className={`group surface rounded-xl p-4 transition-opacity ${g.status === 'archived' ? 'opacity-50' : ''}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <button onClick={() => toggleDone(g)} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors" title={isDone ? 'Mark active' : 'Mark done'}>
            {isDone ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <Circle className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{g.title}</span>
            </div>
            {g.detail && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{g.detail}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {g.area && <Badge variant="secondary" className="text-[10px]">{g.area}</Badge>}
              {g.period && <Badge variant="outline" className="text-[10px]">{g.period}</Badge>}
              {g.targetDate && (
                <span className={`inline-flex items-center gap-1 text-[10px] ${overdue ? 'text-red-400' : 'text-muted-foreground/60'}`}>
                  <Calendar className="h-3 w-3" />
                  {formatTargetDate(g.targetDate)}{overdue ? ' · overdue' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`text-sm font-semibold tabular-nums ${pct === 100 ? 'text-green-400' : 'text-muted-foreground'}`}>{pct}%</span>
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button onClick={() => startEdit(g)} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => patchGoal(g.id, { status: g.status === 'archived' ? 'active' : 'archived' })} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title={g.status === 'archived' ? 'Unarchive' : 'Archive'}>
                <Archive className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => removeGoal(g.id)} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-destructive transition-colors" title="Delete">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-400' : 'bg-foreground'}`} style={{ width: `${pct}%` }} />
        </div>

        {/* Milestones */}
        {milestones.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {milestones.map((m) => (
              <div key={m.id} className="group/ms flex items-center gap-2">
                <button onClick={() => toggleMilestone(g.id, m.id)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                  {m.done ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Circle className="h-4 w-4" />}
                </button>
                <span className={`flex-1 text-xs ${m.done ? 'text-muted-foreground line-through' : 'text-foreground/90'}`}>{m.title}</span>
                <button onClick={() => removeMilestone(g.id, m.id)} className="shrink-0 text-muted-foreground/30 opacity-0 transition-opacity hover:text-destructive group-hover/ms:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add milestone */}
        <div className="mt-2 flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-muted-foreground/40" />
          <input
            value={msDraft[g.id] ?? ''}
            onChange={(e) => setMsDraft((d) => ({ ...d, [g.id]: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && addMilestone(g.id)}
            placeholder="Add a step…"
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          />
        </div>
      </div>
    )
  }

  const hasGoals = visible.length > 0

  return (
    <PageShell>
      <datalist id="goal-areas">
        {areas.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold md:text-2xl md:font-bold">Goals</h2>
          <span className="text-xs text-muted-foreground md:text-sm">
            {activeGoals.length} active · {doneCount} done · {avgProgress}% avg
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-secondary/60 p-0.5">
            {views.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  view === v.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowArchived((s) => !s)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${showArchived ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="Toggle archived goals"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Groups */}
      {hasGoals ? (
        <div className="flex flex-col gap-6">
          {groups.map(([label, gs]) => (
            <div key={label || 'all'} className="flex flex-col gap-2">
              {label && (
                <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                  {label} <span className="text-muted-foreground/30">· {gs.length}</span>
                </p>
              )}
              {gs.map(renderGoal)}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 py-16 text-center">
          <Target className="h-8 w-8 text-muted-foreground/30" />
          <div>
            <p className="text-sm font-medium text-foreground">No goals yet</p>
            <p className="text-xs text-muted-foreground">Add your first one below.</p>
          </div>
        </div>
      )}

      {/* Add goal */}
      <div className="surface rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <GoalIcon className="h-4 w-4" /> New goal
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGoal()} placeholder="What do you want to achieve?" className="h-9 min-w-[180px] flex-1 bg-input text-sm" />
          <Input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Area" className="h-9 w-32 bg-input text-sm" list="goal-areas" />
          <Input value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} placeholder="2026-Q3" className="h-9 w-28 bg-input text-sm" />
          <input type="date" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className="h-9 rounded-md border border-border bg-input px-2 text-sm text-foreground" />
          <button onClick={addGoal} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground transition-colors hover:bg-secondary/80" title="Add goal">
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </PageShell>
  )
}
