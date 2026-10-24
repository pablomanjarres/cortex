import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RefreshButtonProps {
  onClick: () => void
  /** A read is in flight: the icon spins, the button is disabled and shows `busyLabel`. */
  busy: boolean
  /** Disabled for a reason other than a read in flight, e.g. no source configured. */
  disabled?: boolean
  label?: string
  busyLabel?: string
  className?: string
  'aria-label'?: string
}

/** The secondary "Refresh" action shared by panels that re-read a source on demand. */
export function RefreshButton({ onClick, busy, disabled = false, label = 'Refresh', busyLabel = label, className, 'aria-label': ariaLabel }: RefreshButtonProps) {
  return (
    <Button variant="secondary" size="sm" className={className} onClick={onClick} disabled={disabled || busy} aria-label={ariaLabel}>
      <RefreshCw className={cn(busy && 'motion-safe:animate-spin')} />
      {busy ? busyLabel : label}
    </Button>
  )
}
