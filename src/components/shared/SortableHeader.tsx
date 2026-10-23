import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Column header text style, shared by sortable and plain table headers. */
export const tableHeaderClassName = 'py-2 text-left font-mono text-2xs font-normal uppercase tracking-wider'

interface SortableHeaderProps {
  label: string
  active: boolean
  ascending: boolean
  onSort: () => void
  className?: string
}

/** A table column header whose button toggles sorting and announces the current order. */
export function SortableHeader({ label, active, ascending, onSort, className }: SortableHeaderProps) {
  const Icon = !active ? ArrowUpDown : ascending ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'}
      className={cn(tableHeaderClassName, className)}
    >
      <Button
        variant="ghost"
        size="xs"
        onClick={onSort}
        className="h-auto min-h-7 px-0 font-mono text-2xs font-normal uppercase tracking-wider text-inherit hover:bg-transparent hover:text-foreground"
      >
        {label}
        <Icon aria-hidden="true" className={cn('size-3', !active && 'opacity-30')} />
      </Button>
    </th>
  )
}
