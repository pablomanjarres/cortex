import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** Accessible name and tooltip when the label is only an icon. */
  ariaLabel?: string
}

interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group. */
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'icon-xs'
  className?: string
  optionClassName?: string
}

/** A small exclusive choice: each segment is a button that reports its pressed state. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, size = 'sm', className, optionClassName }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex rounded-md border border-border bg-card p-1', className)}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Button
            key={option.value}
            type="button"
            variant={selected ? 'default' : 'ghost'}
            size={size}
            aria-pressed={selected}
            aria-label={option.ariaLabel}
            title={option.ariaLabel}
            onClick={() => { if (!selected) onChange(option.value) }}
            className={optionClassName}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
