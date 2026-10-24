import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Previous/current/next navigation for a day, week or month. */
export function DateStepper({ label, previousLabel, nextLabel, onPrevious, onNext, nextDisabled = false,
  onReset, resetActive = false, size = 'sm', className }: {
  label: ReactNode
  previousLabel: string
  nextLabel: string
  onPrevious: () => void
  onNext: () => void
  nextDisabled?: boolean
  onReset?: () => void
  resetActive?: boolean
  size?: 'sm' | 'touch'
  className?: string
}) {
  const target = size === 'touch' ? 'size-11' : 'size-11 sm:size-8'
  return (
    <div className={cn('flex items-center gap-1', className)} role="group" aria-label="Date navigation">
      <Button variant="ghost" size="icon-sm" className={target} onClick={onPrevious} aria-label={previousLabel}><ChevronLeft /></Button>
      {onReset ? (
        <Button variant="ghost" size="sm" onClick={onReset}
          className={cn('min-h-11 font-mono text-xs', size === 'sm' && 'sm:min-h-8', resetActive ? 'text-accent' : 'text-muted-foreground')}>
          {label}
        </Button>
      ) : <span className="px-2 font-mono text-xs text-muted-foreground">{label}</span>}
      <Button variant="ghost" size="icon-sm" className={target} onClick={onNext} disabled={nextDisabled} aria-label={nextLabel}><ChevronRight /></Button>
    </div>
  )
}
