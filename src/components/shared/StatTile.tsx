import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatTileProps {
  /** Metric label */
  label: string
  /** The metric — rendered tabular text-2xl */
  value: ReactNode
  /** Optional delta slot — typically a <TrendBadge /> */
  delta?: ReactNode
  /** Optional icon slot, rendered quiet at top-right */
  icon?: ReactNode
  /** Optional sub-line under the value */
  sub?: string
  /** glass = translucent KPI treatment */
  variant?: 'default' | 'glass'
  className?: string
}

/**
 * StatTile — the shared KPI tile.
 */
export function StatTile({
  label,
  value,
  delta,
  icon,
  sub,
  variant = 'default',
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        'rounded-xl p-5',
        variant === 'glass' ? 'liquid-glass' : 'surface',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {label}
        </p>
        {icon && <span className="shrink-0 text-accent [&>svg]:size-5">{icon}</span>}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="font-mono text-3xl font-semibold tabular-nums leading-none text-foreground">
          {value}
        </p>
        {delta}
      </div>
      {sub && (
        <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>
      )}
    </div>
  )
}
