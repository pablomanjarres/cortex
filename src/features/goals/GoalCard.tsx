import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Archive, Calendar, CheckCircle2, Circle, Pencil, Plus, X } from 'lucide-react'
import { formatTargetDate, goalProgress, isOverdue, type Goal } from './goal-model'

export interface GoalCardActions {
  onToggleDone: () => void
  onEdit: () => void
  onToggleArchived: () => void
  onDelete: () => void
  onAddMilestone: (title: string) => void
  onToggleMilestone: (milestoneId: string) => void
  onRemoveMilestone: (milestoneId: string) => void
}

/** A goal with its status, progress, steps, and row actions. */
export function GoalCard({ goal: g, highlighted = false, ...actions }: { goal: Goal; highlighted?: boolean } & GoalCardActions) {
  const [stepDraft, setStepDraft] = useState('')
  const pct = goalProgress(g)
  const isDone = g.status === 'done'
  const archived = g.status === 'archived'
  const overdue = isOverdue(g)
  const milestones = g.milestones ?? []

  const addStep = () => {
    const title = stepDraft.trim()
    if (!title) return
    actions.onAddMilestone(title)
    setStepDraft('')
  }

  return (
    <div id={`goal-${g.id}`} className={`group surface rounded-xl p-4 transition-opacity ${highlighted ? 'ring-1 ring-accent/40' : ''} ${archived ? 'opacity-50' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={actions.onToggleDone}
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
            <Button variant="ghost" size="icon-xs" onClick={actions.onEdit} aria-label="Edit goal" title="Edit">
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={actions.onToggleArchived} aria-label={archived ? 'Unarchive goal' : 'Archive goal'} title={archived ? 'Unarchive' : 'Archive'}>
              <Archive />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={actions.onDelete} aria-label="Delete goal" title="Delete" className="hover:text-destructive">
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
                onClick={() => actions.onToggleMilestone(m.id)}
                className="shrink-0"
                aria-label={m.done ? 'Mark step not done' : 'Mark step done'}
              >
                {m.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4" />}
              </Button>
              <span className={`flex-1 text-xs ${m.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{m.title}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => actions.onRemoveMilestone(m.id)}
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
        <Input
          variant="inline"
          value={stepDraft}
          onChange={(e) => setStepDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStep()}
          aria-label={`Add a step to ${g.title}`}
          placeholder="Add a step…"
          className="flex-1 border-b-0"
        />
      </div>
    </div>
  )
}
