import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StatsMetric {
  label: string
  value: ReactNode
  icon: LucideIcon
  /** Semantic ink for the value, e.g. success once a target is met. */
  valueClassName?: string | false
}

/** Dense day-snapshot readouts: icon, label, and a right-aligned value per row. */
export function MetricRows({ metrics }: { metrics: StatsMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, valueClassName }) => (
        <div key={label} className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-2xs text-muted-foreground">{label}</span>
          {typeof value === 'string' || typeof value === 'number'
            ? <span className={cn('ml-auto font-mono text-sm font-medium tabular-nums', valueClassName)}>{value}</span>
            : <span className="ml-auto">{value}</span>}
        </div>
      ))}
    </div>
  )
}

/** Week totals: a labeled tile per metric. */
export function MetricTiles({ metrics }: { metrics: StatsMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {metrics.map(({ label, value, icon: Icon, valueClassName }) => (
        <div key={label} className="flex items-center gap-2.5 rounded-md bg-secondary/30 px-3 py-2.5">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={cn('font-mono text-lg font-medium tabular-nums', valueClassName)}>{value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
