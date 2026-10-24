import { useState } from 'react'
import { useStore } from '@/lib/store'
import { PageShell } from '@/components/shared/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Archive } from 'lucide-react'
import {
  applyGoalDraft, createGoal, emptyGoalDraft, goalProgress, goalUid, groupGoals,
  type Goal, type GoalDraft, type GoalView,
} from './goal-model'
import { GoalCard } from './GoalCard'
import { GoalEditor } from './GoalEditor'

const views: Array<{ id: GoalView; label: string }> = [
  { id: 'area', label: 'By Area' },
  { id: 'timeframe', label: 'By Timeframe' },
  { id: 'deadline', label: 'By Deadline' },
]

export function GoalsPage() {
  const [goals, setGoals] = useStore<Goal[]>('cortex-goals', [])

  const [view, setView] = useState<GoalView>('area')
  const [showArchived, setShowArchived] = useState(false)
  const [newGoal, setNewGoal] = useState(emptyGoalDraft)
  const [editingId, setEditingId] = useState<string | null>(null)

  const areas = [...new Set(goals.map((g) => g.area).filter(Boolean))] as string[]

  // ── Mutators ──
  const addGoal = () => {
    const goal = createGoal(newGoal)
    if (!goal) return
    setGoals((prev) => [...prev, goal])
    setNewGoal(emptyGoalDraft())
  }
  const setNewField = (patch: Partial<GoalDraft>) => setNewGoal((d) => ({ ...d, ...patch }))

  const patchGoal = (id: string, patch: Partial<Goal>) =>
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  const mapMilestones = (goalId: string, fn: (milestones: NonNullable<Goal['milestones']>) => Goal['milestones']) =>
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, milestones: fn(g.milestones ?? []) } : g)))

  const saveEdit = (id: string, draft: GoalDraft) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? applyGoalDraft(g, draft) : g)))
    setEditingId(null)
  }

  const toggleDone = (g: Goal) => {
    if (g.status === 'done') patchGoal(g.id, { status: 'active', completedAt: undefined })
    else patchGoal(g.id, { status: 'done', completedAt: new Date().toISOString() })
  }

  // ── Derived: visible goals + grouping ──
  const visible = goals.filter((g) => (showArchived ? true : g.status !== 'archived'))
  const activeGoals = goals.filter((g) => g.status === 'active')
  const doneCount = goals.filter((g) => g.status === 'done').length
  const avgProgress =
    activeGoals.length > 0
      ? Math.round(activeGoals.reduce((s, g) => s + goalProgress(g), 0) / activeGoals.length)
      : 0
  const groups = groupGoals(visible, view)

  const renderGoal = (g: Goal) =>
    editingId === g.id ? (
      <GoalEditor key={g.id} goal={g} onSave={(draft) => saveEdit(g.id, draft)} onCancel={() => setEditingId(null)} />
    ) : (
      <GoalCard
        key={g.id}
        goal={g}
        onToggleDone={() => toggleDone(g)}
        onEdit={() => setEditingId(g.id)}
        onToggleArchived={() => patchGoal(g.id, { status: g.status === 'archived' ? 'active' : 'archived' })}
        onDelete={() => setGoals((prev) => prev.filter((x) => x.id !== g.id))}
        onAddMilestone={(title) => mapMilestones(g.id, (ms) => [...ms, { id: goalUid('ms'), title, done: false }])}
        onToggleMilestone={(mId) => mapMilestones(g.id, (ms) => ms.map((m) => (m.id === mId ? { ...m, done: !m.done } : m)))}
        onRemoveMilestone={(mId) => mapMilestones(g.id, (ms) => ms.filter((m) => m.id !== mId))}
      />
    )

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
          <Tabs value={view} onValueChange={(v) => setView(v as GoalView)}>
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
          <Input value={newGoal.title} onChange={(e) => setNewField({ title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addGoal()} aria-label="Goal title" placeholder="What do you want to achieve?" className="h-11 w-full min-w-0 text-sm sm:h-9 sm:w-auto sm:min-w-[180px] sm:flex-1" />
          <Input value={newGoal.area} onChange={(e) => setNewField({ area: e.target.value })} aria-label="Goal area" placeholder="Area" className="h-11 w-32 text-sm sm:h-9" list="goal-areas" />
          <Input value={newGoal.period} onChange={(e) => setNewField({ period: e.target.value })} aria-label="Goal timeframe" placeholder="2026-Q3" className="h-11 w-28 text-sm sm:h-9" />
          <Input type="date" value={newGoal.targetDate} onChange={(e) => setNewField({ targetDate: e.target.value })} aria-label="Goal target date" className="h-11 w-auto px-2 text-sm sm:h-9" />
          <Button variant="secondary" size="icon-lg" onClick={addGoal} aria-label="Add goal" title="Add goal">
            <Plus className="size-5" />
          </Button>
        </div>
      </WidgetCard>
    </PageShell>
  )
}
