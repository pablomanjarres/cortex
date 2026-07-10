import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatTileProps {
  /** Mono-uppercase metric label */
  label: string
  /** The metric — rendered mono tabular text-2xl */
  value: ReactNode
  /** Optional delta slot — typically a <TrendBadge /> */
  delta?: ReactNode
  /** Optional icon slot, rendered quiet at top-right */
  icon?: ReactNode
  /** Optional sub-line under the value (mono faint) */
  sub?: string
  /** glass = the second sanctioned .liquid-glass role (KPI hero tiles) */
  variant?: 'default' | 'glass'
  className?: string
}

/**
 * StatTile — THE KPI tile. Replaces every hand-rolled metric tile.
 * Label mono-upper 2xs muted, value mono tabular text-2xl, optional
 * TrendBadge delta and icon.
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
        'rounded-xl p-4',
        variant === 'glass' ? 'liquid-glass' : 'surface',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {icon && <span className="shrink-0 text-foreground-faint [&>svg]:size-4">{icon}</span>}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="font-mono text-2xl font-medium tabular-nums leading-none text-foreground">
          {value}
        </p>
        {delta}
      </div>
      {sub && (
        <p className="mt-1.5 font-mono text-2xs text-foreground-faint">{sub}</p>
      )}
    </div>
  )
}
