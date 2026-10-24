import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const toneClasses = {
  danger: 'border-destructive/25 bg-destructive/10 text-destructive',
  warning: 'border-warning/25 bg-warning/10 text-warning',
} as const

interface NoticeProps {
  tone: keyof typeof toneClasses
  /** Optional leading icon; the text carries the meaning. */
  icon?: ReactNode
  children: ReactNode
  className?: string
}

/** An announced inline banner for a failure or a condition that needs attention. */
export function Notice({ tone, icon, children, className }: NoticeProps) {
  return (
    <div role="alert" className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', toneClasses[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0 [&>svg]:size-4" aria-hidden>{icon}</span>}
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}
