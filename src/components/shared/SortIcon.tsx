import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'

export function SortIcon({ active, ascending }: { active: boolean; ascending: boolean }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-30" />
  return ascending ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
}
