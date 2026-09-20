import type { Dispatch, SetStateAction } from 'react'
import { Pencil, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { cn } from '@/lib/utils'
import type { Cadence, Habit } from '@/lib/habits'
import { HabitAddForm, HabitEditFields } from './HabitForms'
import type { HabitDraft } from './habitFormState'
import { HabitNoteButton, HabitNoteEditor } from './HabitNotes'
interface HabitEditState {
  editingId: string | null
  name: string
  emoji: string
  goal: string
  cadence: Cadence
  onNameChange: (value: string) => void
  onEmojiChange: (value: string) => void
  onGoalChange: (value: string) => void
  onCadenceChange: (value: Cadence) => void
  onSave: () => void
  cancel: () => void
}

interface OnHoldHabitsSectionProps {
  habits: Habit[]
  layout: 'mobile' | 'desktop'
  draft: HabitDraft
  setDraft: Dispatch<SetStateAction<HabitDraft>>
  customCategory: boolean
  setCustomCategory: (value: boolean) => void
  categoryOptions: string[]
  edit: HabitEditState
  expandedNoteId: string | null
  onAdd: () => void
  onActivate: (id: string) => void
  onEdit: (habit: Habit) => void
  onDelete: (id: string) => void
  onToggleNote: (id: string) => void
  onContextChange: (id: string, value: string) => void
}
function getHabitCadenceLabel(habit: Habit) {
  if ((habit.cadence ?? 'weekly') === 'monthly') return `${habit.monthlyGoal ?? 1}x/mo`
  const goal = habit.weeklyGoal ?? 7
  return goal < 7 ? `${goal}x/wk` : 'weekly'
}
function HeldHabitCard({
  habit,
  compact,
  edit,
  expandedNoteId,
  onActivate,
  onEdit,
  onDelete,
  onToggleNote,
  onContextChange,
}: {
  habit: Habit
  compact: boolean
  edit: HabitEditState
  expandedNoteId: string | null
  onActivate: (id: string) => void
  onEdit: (habit: Habit) => void
  onDelete: (id: string) => void
  onToggleNote: (id: string) => void
  onContextChange: (id: string, value: string) => void
}) {
  return (
    <div className={cn('rounded-md border border-border/60 bg-secondary/25', compact ? 'p-3' : 'p-2.5')}>
      {edit.editingId === habit.id ? (
        <div className="flex flex-col gap-2">
          <HabitEditFields
            name={edit.name}
            emoji={edit.emoji}
            goal={edit.goal}
            cadence={edit.cadence}
            onNameChange={edit.onNameChange}
            onEmojiChange={edit.onEmojiChange}
            onGoalChange={edit.onGoalChange}
            onCadenceChange={edit.onCadenceChange}
            onSave={edit.onSave}
            compact={compact}
          />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={edit.onSave}>Save</Button>
            <Button variant="ghost" size="sm" onClick={edit.cancel}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0">{habit.emoji}</span>
              <span className="truncate text-sm font-medium text-foreground">{habit.name}</span>
              <HabitNoteButton habit={habit} expanded={expandedNoteId === habit.id} onToggle={() => onToggleNote(habit.id)} mobile={compact} alwaysVisible />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {habit.category && <Chip size="sm">{habit.category}</Chip>}
              <Chip size="sm">{getHabitCadenceLabel(habit)}</Chip>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size={compact ? 'icon-sm' : 'icon-xs'} onClick={() => onActivate(habit.id)} aria-label="Activate habit">
              <Play />
            </Button>
            <Button variant="ghost" size={compact ? 'icon-sm' : 'icon-xs'} onClick={() => onEdit(habit)} aria-label="Edit held habit">
              <Pencil />
            </Button>
            <Button variant="ghost" size={compact ? 'icon-sm' : 'icon-xs'} onClick={() => onDelete(habit.id)} aria-label="Delete held habit" className="hover:text-destructive active:text-destructive">
              <X />
            </Button>
          </div>
        </div>
      )}
      {expandedNoteId === habit.id && (
        <div className="mt-3">
          <HabitNoteEditor habit={habit} onChange={(value) => onContextChange(habit.id, value)} />
        </div>
      )}
    </div>
  )
}
function OnHoldHabitsContent({
  habits,
  compact,
  draft,
  setDraft,
  customCategory,
  setCustomCategory,
  categoryOptions,
  edit,
  expandedNoteId,
  onAdd,
  onActivate,
  onEdit,
  onDelete,
  onToggleNote,
  onContextChange,
}: Omit<OnHoldHabitsSectionProps, 'layout'> & { compact: boolean }) {
  return (
    <div className="space-y-3">
      {habits.length > 0 ? (
        <div className="flex flex-col gap-2">
          {habits.map((habit) => (
            <HeldHabitCard
              key={habit.id}
              habit={habit}
              compact={compact}
              edit={edit}
              expandedNoteId={expandedNoteId}
              onActivate={onActivate}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleNote={onToggleNote}
              onContextChange={onContextChange}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border/70 px-3 py-2 text-sm text-muted-foreground">
          No habits on hold yet.
        </p>
      )}
      <HabitAddForm
        draft={draft}
        setDraft={setDraft}
        customCategory={customCategory}
        setCustomCategory={setCustomCategory}
        categoryOptions={categoryOptions}
        onAdd={onAdd}
        compact={!compact}
        onHold
        className="border-t border-border/60 pt-3"
      />
    </div>
  )
}
export function OnHoldHabitsSection({ layout, ...props }: OnHoldHabitsSectionProps) {
  if (layout === 'desktop') {
    return (
      <WidgetCard title="On hold" description="Save habits you want to start later. They do not count toward progress." delay={0.25}>
        <OnHoldHabitsContent {...props} compact={false} />
      </WidgetCard>
    )
  }
  return (
    <div className="space-y-3 pt-2">
      <div>
        <p className="font-mono text-2xs uppercase tracking-widest text-foreground-faint">On hold</p>
        <p className="mt-1 text-xs text-muted-foreground">Save habits you want to start later. They do not count toward progress.</p>
      </div>
      <div className="surface rounded-xl p-4">
        <OnHoldHabitsContent {...props} compact />
      </div>
    </div>
  )
}
