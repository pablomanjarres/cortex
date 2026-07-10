import { cn } from '@/lib/utils'

interface TrendBadgeProps {
  /** Percent change, e.g. 12.4, -3, 0 */
  value: number
  /** Set when a decrease is good (expenses, load, errors) */
  invert?: boolean
  /** Decimal places (default 1; trailing zeros trimmed) */
  precision?: number
  className?: string
}

/**
 * TrendBadge — direction + percent in instrument mono.
 * up = success, down = danger (flip with `invert`), flat = neutral.
 */
export function TrendBadge({ value, invert = false, precision = 1, className }: TrendBadgeProps) {
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  const good = direction === 'flat' ? null : (direction === 'up') !== invert
  const glyph = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—'
  const magnitude = Number(Math.abs(value).toFixed(precision))

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-2xs tabular-nums',
        direction === 'flat' && 'text-foreground-faint',
        good === true && 'text-success',
        good === false && 'text-destructive',
        className
      )}
    >
      <span aria-hidden>{glyph}</span>
      {direction === 'flat' ? '0%' : `${magnitude}%`}
      <span className="sr-only">
        {direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'no change'}
      </span>
    </span>
  )
}
