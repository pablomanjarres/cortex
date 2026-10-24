import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  icon: ReactNode
  name: string
  detail: ReactNode
  /** Countdown or overdue chip on the right of the summary. */
  badge: ReactNode
  /** The contact is open in the contact list. */
  selected: boolean
  urgent?: boolean
  onSelect: () => void
  /** Optional quick action beside the summary, e.g. resetting the last contact. */
  action?: ReactNode
}

/** A reminder about one contact; selecting it opens that contact in the list below. */
export function ContactReminderRow({ icon, name, detail, badge, selected, urgent, onSelect, action }: Props) {
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-md px-3 py-2 transition-colors duration-150',
      urgent ? 'bg-warning/5 hover:bg-warning/10' : 'hover:bg-secondary/50',
      selected && 'ring-1 ring-accent/40',
    )}>
      <Button
        type="button"
        variant="ghost"
        aria-pressed={selected}
        onClick={onSelect}
        className="h-auto min-w-0 flex-1 justify-start gap-3 p-0 text-left font-normal whitespace-normal text-foreground hover:bg-transparent hover:text-foreground active:scale-100"
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block text-2xs text-muted-foreground">{detail}</span>
        </span>
        {badge}
      </Button>
      {action}
    </div>
  )
}
