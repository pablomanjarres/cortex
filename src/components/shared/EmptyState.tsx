import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** The serif italic whisper line, e.g. "Nothing captured yet." */
  message: string
  /** Optional quiet hint under the whisper */
  hint?: string
  /** Optional action slot (a Button, usually ghost or secondary) */
  action?: ReactNode
  className?: string
}

/**
 * EmptyState — the ONLY empty-state affordance. A serif italic whisper,
 * an optional hint, an optional action. No dashed borders, no big icons.
 */
export function EmptyState({ message, hint, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 py-10 text-center',
        className
      )}
    >
      <p className="font-serif italic text-lg text-muted-foreground">{message}</p>
      {hint && <p className="text-xs text-foreground-faint">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
