import type { ComponentProps, ReactNode } from 'react'
import { Chip } from '@/components/ui/chip'

interface StatusHeadlineProps {
  tone: ComponentProps<typeof Chip>['variant']
  label: string
  /** When the reading was taken, shown as a small timestamp line. */
  meta: ReactNode
  note: string
}

/** A System panel's live summary: status chip, reading time and one-line note. */
export function StatusHeadline({ tone, label, meta, note }: StatusHeadlineProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Chip variant={tone}>{label}</Chip>
        <span className="font-mono text-2xs text-foreground-faint">{meta}</span>
      </div>
      <p className="text-sm text-muted-foreground">{note}</p>
    </div>
  )
}
