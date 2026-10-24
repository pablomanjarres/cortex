import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { goalDraft, type Goal, type GoalDraft, type GoalStatus } from './goal-model'

/** Inline goal editor. Keeps its own draft; nothing is written until Save. */
export function GoalEditor({ goal, onSave, onCancel }: {
  goal: Goal
  onSave: (draft: GoalDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(() => goalDraft(goal))
  const set = (patch: Partial<GoalDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const save = () => { if (draft.title.trim()) onSave(draft) }
  const hasMilestones = (goal.milestones?.length ?? 0) > 0

  return (
    <div className="surface rounded-xl p-4">
      <div className="flex flex-col gap-2">
        <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label="Goal title" className="h-9" placeholder="Goal title" autoFocus />
        <Textarea
          value={draft.detail}
          onChange={(e) => set({ detail: e.target.value })}
          aria-label="Goal details"
          placeholder="Why this matters / notes…"
          className="min-h-14 w-full resize-y px-2.5 py-2 text-sm leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input value={draft.area} onChange={(e) => set({ area: e.target.value })} aria-label="Goal area" placeholder="Area" className="h-8 w-32 text-sm" list="goal-areas" />
          <Input value={draft.period} onChange={(e) => set({ period: e.target.value })} aria-label="Goal timeframe" placeholder="2026-Q3" className="h-8 w-28 text-sm" />
          <Input type="date" value={draft.targetDate} onChange={(e) => set({ targetDate: e.target.value })} aria-label="Goal target date" className="h-8 w-auto px-2 text-sm" />
          {!hasMilestones && (
            <div className="flex items-center gap-1">
              <Input value={draft.progress} onChange={(e) => set({ progress: e.target.value })} type="number" min={0} max={100} aria-label="Goal progress percent" className="h-8 w-16 px-1 text-center text-sm" title="Progress %" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          )}
          <Select value={draft.status} onChange={(e) => set({ status: e.target.value as GoalStatus })} aria-label="Goal status" className="h-8 cursor-pointer px-2 text-sm">
            <option value="active">Active</option>
            <option value="done">Done</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={save} className="flex-1">Save</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
