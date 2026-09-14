import { StickyNote } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Habit } from '@/lib/habits'

interface HabitNoteButtonProps {
  habit: Habit
  expanded: boolean
  onToggle: () => void
  mobile?: boolean
  alwaysVisible?: boolean
}

export function HabitNoteButton({ habit, expanded, onToggle, mobile, alwaysVisible }: HabitNoteButtonProps) {
  return (
    <Button
      variant="ghost"
      size={mobile ? 'icon-sm' : 'icon-xs'}
      onClick={onToggle}
      title={habit.context ? 'Context — click to edit' : 'Add context'}
      aria-label={habit.context ? 'Edit habit context' : 'Add habit context'}
      className={cn(
        expanded
          ? 'text-foreground'
          : habit.context
            ? 'text-warning/80 hover:text-warning'
            : mobile || alwaysVisible
              ? 'text-foreground-faint'
              : 'text-foreground-faint opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
      )}
    >
      <StickyNote />
    </Button>
  )
}

interface HabitNoteEditorProps {
  habit: Habit
  onChange: (value: string) => void
}

export function HabitNoteEditor({ habit, onChange }: HabitNoteEditorProps) {
  return (
    <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
        <StickyNote className="h-3 w-3" />
        What this means · what counts as done
      </div>
      <textarea
        value={habit.context ?? ''}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
        placeholder="Write the full meaning of this habit and exactly what has to be done to check it off…"
        className="min-h-[72px] w-full resize-y rounded-md border border-input bg-input/20 px-2.5 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors duration-150 placeholder:text-foreground-faint focus-visible:border-ring/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
    </div>
  )
}
