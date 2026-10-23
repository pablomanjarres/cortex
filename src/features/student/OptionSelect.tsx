import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface OptionSelectProps<T extends string> {
  value: T
  options: readonly T[]
  onChange: (value: T) => void
  /** Accessible name — compact selects sit beside a visual label, never inside one. */
  label: string
  className?: string
}

/** Compact mono select for Student property rows and assignment rows. */
export function OptionSelect<T extends string>({ value, options, onChange, label, className }: OptionSelectProps<T>) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={label}
      className={cn('h-6 cursor-pointer px-1.5 font-mono text-2xs', className)}
    >
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </Select>
  )
}
