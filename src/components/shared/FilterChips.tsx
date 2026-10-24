import type { ComponentProps, ReactNode } from 'react'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'

export interface FilterOption<T extends string> {
  value: T
  label: ReactNode
  variant?: ComponentProps<typeof Chip>['variant']
}

/** A single optional filter. Selecting the active chip clears it. */
export function FilterChips<T extends string>({ label, options, value, onChange, size = 'sm', className, chipClassName }: {
  label: string
  options: readonly FilterOption<T>[]
  value: T | null
  onChange: (value: T | null) => void
  size?: ComponentProps<typeof Chip>['size']
  className?: string
  /** Applied to every chip, e.g. a larger mobile touch target. */
  chipClassName?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((option) => (
        <Chip key={option.value} selectable size={size} variant={option.variant} className={chipClassName}
          selected={value === option.value} onClick={() => onChange(value === option.value ? null : option.value)}>
          {option.label}
        </Chip>
      ))}
    </div>
  )
}
