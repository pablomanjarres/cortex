import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** One choice in a gym selector rail (meal, template, market week): a title plus mono detail lines. */
export function SelectionCard({ title, selected, current = false, onSelect, children, className }: {
  title: ReactNode
  selected: boolean
  /** Marks the choice that holds today, independent of the selection. */
  current?: boolean
  onSelect: () => void
  children?: ReactNode
  className?: string
}) {
  return (
    <Button
      variant="secondary"
      onClick={onSelect}
      aria-pressed={selected}
      aria-current={current || undefined}
      className={cn(
        'h-auto min-h-14 flex-col items-start gap-1 whitespace-normal rounded-md border px-3 py-3 text-left',
        selected ? 'border-accent/40 bg-accent/10' : 'border-border bg-card hover:bg-muted/40',
        current && 'ring-1 ring-foreground/20',
        className,
      )}
    >
      <span className={cn('text-sm font-medium', selected ? 'text-foreground' : 'text-muted-foreground')}>{title}</span>
      {children && <span className="flex flex-col items-start font-mono text-2xs tabular-nums text-foreground-faint">{children}</span>}
    </Button>
  )
}
