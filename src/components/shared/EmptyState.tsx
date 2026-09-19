import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** Short, plain empty-state message, e.g. "Nothing captured yet." */
  message: string
  /** Optional quiet hint under the message */
  hint?: string
  /** Optional action slot (a Button, usually ghost or secondary) */
  action?: ReactNode
  className?: string
}

/**
 * EmptyState — a clear message, optional hint, and optional action.
 */
export function EmptyState({ message, hint, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 py-10 text-center',
        className
      )}
    >
      <p className="text-base font-medium text-muted-foreground">{message}</p>
      {hint && <p className="text-xs text-foreground-faint">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
