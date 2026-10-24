import type { Dispatch, SetStateAction } from 'react'
import { Pencil, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { cn } from '@/lib/utils'
import type { Habit } from '@/lib/habits'
import { HabitAddForm, HabitEditPanel } from './HabitForms'
import type { HabitDraft } from './habitFormState'
import { HabitNoteButton, HabitNoteEditor } from './HabitNotes'
import { habitGoalLabel } from './habit-progress'
import type { HabitEditor } from './useHabitEditor'

interface OnHoldHabitsSectionProps {
  habits: Habit[]
  layout: 'mobile' | 'desktop'
  draft: HabitDraft
  setDraft: Dispatch<SetStateAction<HabitDraft>>
  customCategory: boolean
  setCustomCategory: (value: boolean) => void
  categoryOptions: string[]
  editor: HabitEditor
  expandedNoteId: string | null
  onAdd: () => void
  onActivate: (id: string) => void
  onDelete: (id: string) => void
  onToggleNote: (id: string) => void
  onContextChange: (id: string, value: string) => void
}
function HeldHabitCard({
  habit,
  compact,
  editor,
  expandedNoteId,
  onActivate,
  onDelete,
  onToggleNote,
  onContextChange,
}: {
  habit: Habit
  compact: boolean
  editor: HabitEditor
  expandedNoteId: string | null
  onActivate: (id: string) => void
  onDelete: (id: string) => void
  onToggleNote: (id: string) => void
  onContextChange: (id: string, value: string) => void
}) {
  return (
    <div className={cn('rounded-md border border-border/60 bg-secondary/25', compact ? 'p-3' : 'p-2.5')}>
      {editor.editingId === habit.id ? (
        <HabitEditPanel editor={editor} compact={compact} size="sm" />
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
              <Chip size="sm">{habitGoalLabel(habit) ?? 'weekly'}</Chip>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size={compact ? 'icon-sm' : 'icon-xs'} onClick={() => onActivate(habit.id)} aria-label="Activate habit">
              <Play />
            </Button>
            <Button variant="ghost" size={compact ? 'icon-sm' : 'icon-xs'} onClick={() => editor.start(habit)} aria-label="Edit held habit">
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
  editor,
  expandedNoteId,
  onAdd,
  onActivate,
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
              editor={editor}
              expandedNoteId={expandedNoteId}
              onActivate={onActivate}
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
