import type { ComponentProps } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type SearchInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'aria-label'> & {
  label: string
  containerClassName?: string
}

/** Search icon, accessible name, and input remain one control. */
export function SearchInput({ label, className, containerClassName, ...props }: SearchInputProps) {
  return (
    <div className={cn('relative min-w-0', containerClassName)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input {...props} type="search" aria-label={label} className={cn('pl-9', className)} />
    </div>
  )
}
