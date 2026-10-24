import { Archive, Check, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HabitProgress } from './habit-progress'

/** Done/goal readout for the viewed window; monthly goals carry a /mo suffix. */
export function HabitGoalProgress({ progress, monthLabel, className }: {
  progress: HabitProgress
  monthLabel: string
  className?: string
}) {
  const { cadence, goal, done, met } = progress
  return (
    <span className={cn(
      'font-mono tabular-nums',
      goal === 0 ? 'text-foreground-faint' : met ? 'text-success' : 'text-muted-foreground',
      className,
    )}>
      {Math.min(done, goal)}/{goal}
      {cadence === 'monthly' && <span className="ml-0.5 text-3xs font-normal text-foreground-faint" title={`Monthly goal · ${monthLabel}`}>/mo</span>}
    </span>
  )
}

/** Edit, archive, and delete for an active habit. Dense rows reveal them on hover or focus. */
export function ActiveHabitActions({ dense, editing = false, onEdit, onSave, onArchive, onDelete }: {
  dense: boolean
  editing?: boolean
  onEdit: () => void
  onSave: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const size = dense ? 'icon-xs' : 'icon-lg'
  return (
    <div className={cn(
      'flex items-center gap-1',
      dense && 'opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100',
    )}>
      {editing ? (
        <Button variant="ghost" size={size} onClick={onSave} aria-label="Save habit">
          <Check />
        </Button>
      ) : (
        <Button variant="ghost" size={size} onClick={onEdit} aria-label="Edit habit">
          <Pencil />
        </Button>
      )}
      <Button variant="ghost" size={size} onClick={onArchive} aria-label="Move habit to on hold">
        <Archive />
      </Button>
      <Button variant="ghost" size={size} onClick={onDelete} aria-label="Delete habit" className="hover:text-destructive active:text-destructive">
        <X />
      </Button>
    </div>
  )
}

/** One day's check for a habit: a grid cell in dense rows, a labeled circle on cards. */
export function HabitDayToggle({ habitName, day, checked, isToday, dense, onToggle }: {
  habitName: string
  day: string
  checked: boolean
  isToday: boolean
  dense: boolean
  onToggle: () => void
}) {
  const label = `${habitName} — ${day}`
  if (dense) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={label}
        className={cn(
          checked
            ? 'border-success/25 bg-success/10 text-success hover:bg-success/15 hover:text-success'
            : 'bg-secondary hover:bg-secondary/80'
        )}
      >
        {checked && <span className="text-xs">✓</span>}
      </Button>
    )
  }
  return (
    <Button
      variant="ghost"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={label}
      className="h-auto min-w-0 flex-col gap-1 px-0 py-1"
    >
      <span className={cn('font-mono text-2xs', isToday ? 'text-foreground' : 'text-foreground-faint')}>{day}</span>
      <span className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full transition-colors min-[360px]:h-9 min-[360px]:w-9',
        checked
          ? 'border border-success/25 bg-success/10 text-success'
          : isToday
            ? 'bg-secondary ring-1 ring-input'
            : 'bg-secondary'
      )}>
        {checked && <span className="text-sm">✓</span>}
      </span>
    </Button>
  )
}
