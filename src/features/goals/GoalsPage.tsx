import { useState } from 'react'
import { useStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import { PageShell } from '@/components/shared/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Plus,
  X,
  Pencil,
  Circle,
  CheckCircle2,
  Calendar,
  Archive,
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
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} className="h-9" placeholder="Goal title" autoFocus />
            <textarea
              value={editDetail}
              onChange={(e) => setEditDetail(e.target.value)}
              placeholder="Why this matters / notes…"
              className="min-h-14 w-full resize-y rounded-md border border-input bg-input/20 px-2.5 py-2 text-sm leading-relaxed text-foreground placeholder:text-foreground-faint"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input value={editArea} onChange={(e) => setEditArea(e.target.value)} placeholder="Area" className="h-8 w-32 text-sm" list="goal-areas" />
              <Input value={editPeriod} onChange={(e) => setEditPeriod(e.target.value)} placeholder="2026-Q3" className="h-8 w-28 text-sm" />
              <input type="date" value={editTarget} onChange={(e) => setEditTarget(e.target.value)} className="h-8 rounded-md border border-input bg-input/20 px-2 text-sm text-foreground" />
              {milestones.length === 0 && (
                <div className="flex items-center gap-1">
                  <Input value={editProgress} onChange={(e) => setEditProgress(e.target.value)} type="number" min={0} max={100} className="h-8 w-16 px-1 text-center text-sm" title="Progress %" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              )}
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as GoalStatus)} className="h-8 cursor-pointer rounded-md border border-input bg-input/20 px-2 text-sm text-foreground">
                <option value="active">Active</option>
                <option value="done">Done</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={saveEdit} className="flex-1">Save</Button>
              <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div key={g.id} className={`group surface rounded-xl p-4 transition-opacity ${g.status === 'archived' ? 'opacity-50' : ''}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => toggleDone(g)}
            className="-ml-1.5 -mt-1 shrink-0"
            aria-label={isDone ? 'Mark active' : 'Mark done'}
            title={isDone ? 'Mark active' : 'Mark done'}
          >
            {isDone ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5" />}
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{g.title}</span>
            </div>
            {g.detail && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{g.detail}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {g.area && <Chip size="sm">{g.area}</Chip>}
              {g.period && <Chip size="sm">{g.period}</Chip>}
              {g.targetDate && (
                <span className={`inline-flex items-center gap-1 font-mono text-2xs tabular-nums ${overdue ? 'text-destructive' : 'text-foreground-faint'}`}>
                  <Calendar className="h-3 w-3" />
                  {formatTargetDate(g.targetDate)}{overdue ? ' · overdue' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`font-mono text-sm font-medium tabular-nums ${pct === 100 ? 'text-success' : 'text-muted-foreground'}`}>{pct}%</span>
            <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <Button variant="ghost" size="icon-xs" onClick={() => startEdit(g)} aria-label="Edit goal" title="Edit">
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => patchGoal(g.id, { status: g.status === 'archived' ? 'active' : 'archived' })} aria-label={g.status === 'archived' ? 'Unarchive goal' : 'Archive goal'} title={g.status === 'archived' ? 'Unarchive' : 'Archive'}>
                <Archive />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => removeGoal(g.id)} aria-label="Delete goal" title="Delete" className="hover:text-destructive">
                <X />
              </Button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <Progress
          value={pct}
          className={`mt-3 ${pct === 100 ? '[&_[data-slot=progress-indicator]]:bg-success' : '[&_[data-slot=progress-indicator]]:bg-accent'}`}
        />

        {/* Milestones */}
        {milestones.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {milestones.map((m) => (
              <div key={m.id} className="group/ms flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => toggleMilestone(g.id, m.id)}
                  className="shrink-0"
                  aria-label={m.done ? 'Mark step not done' : 'Mark step done'}
                >
                  {m.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4" />}
                </Button>
                <span className={`flex-1 text-xs ${m.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{m.title}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeMilestone(g.id, m.id)}
                  aria-label="Remove step"
                  className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/ms:opacity-100 hover:text-destructive"
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add milestone */}
        <div className="mt-2 flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-foreground-faint" />
          <input
            value={msDraft[g.id] ?? ''}
            onChange={(e) => setMsDraft((d) => ({ ...d, [g.id]: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && addMilestone(g.id)}
            placeholder="Add a step…"
            className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-foreground-faint"
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

      {/* Toolbar — the topbar already owns the page title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {activeGoals.length} active · {doneCount} done · {avgProgress}% avg
        </p>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              {views.map((v) => (
                <TabsTrigger key={v.id} value={v.id}>
                  {v.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            variant={showArchived ? 'secondary' : 'ghost'}
            size="icon-sm"
            onClick={() => setShowArchived((s) => !s)}
            aria-pressed={showArchived}
            aria-label="Toggle archived goals"
            title="Toggle archived goals"
          >
            <Archive />
          </Button>
        </div>
      </div>

      {/* Groups */}
      {hasGoals ? (
        <div className="flex flex-col gap-6">
          {groups.map(([label, gs]) => (
            <div key={label || 'all'} className="flex flex-col gap-2">
              {label && (
                <p className="px-1 font-mono text-2xs uppercase tracking-widest text-foreground-faint">
                  {label} · {gs.length}
                </p>
              )}
              {gs.map(renderGoal)}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No goals yet." hint="Add your first one below." />
      )}

      {/* Add goal */}
      <WidgetCard title="New goal">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGoal()} placeholder="What do you want to achieve?" className="h-9 min-w-[180px] flex-1 text-sm" />
          <Input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Area" className="h-9 w-32 text-sm" list="goal-areas" />
          <Input value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} placeholder="2026-Q3" className="h-9 w-28 text-sm" />
          <input type="date" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className="h-9 rounded-md border border-input bg-input/20 px-2 text-sm text-foreground" />
          <Button variant="secondary" size="icon-lg" onClick={addGoal} aria-label="Add goal" title="Add goal">
            <Plus className="size-5" />
          </Button>
        </div>
      </WidgetCard>
    </PageShell>
  )
}
