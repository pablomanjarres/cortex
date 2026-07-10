/* eslint-disable react-refresh/only-export-components --
   Deliberate lib module: token helpers + the ThemedTooltip component live
   together as the one chart-styling entry point (see DESIGN-SYSTEM.md). */
import type { ReactNode } from 'react'

/**
 * chart-theme — the single source of truth for chart styling.
 * Colors are read from the CSS custom properties at runtime, so charts always
 * match the live token palette. NEVER hardcode hex values in chart props.
 *
 * Usage (recharts):
 *   const colors = chartColors()
 *   <CartesianGrid {...gridProps()} />
 *   <XAxis dataKey="day" {...axisProps()} />
 *   <YAxis width={28} {...axisProps()} />
 *   <RTooltip content={<ThemedTooltip />} />
 *   <Area dataKey="sessions" stroke={colors[0]} fill={colors[0]} fillOpacity={0.12} />
 */

const CHART_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const

export const CHART_FONT_MONO =
  'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

/** Resolve a CSS custom property from :root at call time. */
export function cssVar(name: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** The 5-color chart family: [accent-cyan, green, amber, violet, rose]. */
export function chartColors(): string[] {
  return CHART_VARS.map((v) => cssVar(v))
}

/** One series color, 0-based, wrapping past 5. */
export function chartColor(index: number): string {
  return cssVar(CHART_VARS[((index % CHART_VARS.length) + CHART_VARS.length) % CHART_VARS.length])
}

/** Axis preset — mono 10px muted ticks, no tick/axis lines. Spread onto XAxis/YAxis. */
export function axisProps() {
  return {
    tickLine: false as const,
    axisLine: false as const,
    tick: {
      fontSize: 10,
      fill: cssVar('--muted-foreground'),
      fontFamily: CHART_FONT_MONO,
    },
  }
}

/** Grid preset — horizontal hairlines only, border token at low alpha. Spread onto CartesianGrid. */
export function gridProps() {
  return {
    stroke: cssVar('--border'),
    strokeOpacity: 0.5,
    vertical: false as const,
  }
}

// ── ThemedTooltip ───────────────────────────────────────────────────────────

interface TooltipEntry {
  name?: string | number
  value?: number | string
  color?: string
  stroke?: string
  fill?: string
  dataKey?: string | number
  unit?: string | number
}

interface ThemedTooltipProps {
  /** Injected by recharts */
  active?: boolean
  /** Injected by recharts */
  payload?: ReadonlyArray<TooltipEntry>
  /** Injected by recharts */
  label?: string | number
  /** Optional per-entry formatter: (value, name) => rendered value */
  formatter?: (value: number | string, name: string) => ReactNode
  /** Optional label formatter */
  labelFormatter?: (label: string | number) => ReactNode
}

/**
 * ThemedTooltip — recharts tooltip matching card surfaces.
 * Pass as: <Tooltip content={<ThemedTooltip />} cursor={{ stroke: cssVar('--border') }} />
 */
export function ThemedTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: ThemedTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-lift">
      {label !== undefined && label !== '' && (
        <p className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="flex flex-col gap-0.5">
        {payload.map((entry, i) => {
          const color = entry.color ?? entry.stroke ?? entry.fill
          const name = String(entry.name ?? entry.dataKey ?? '')
          const raw = entry.value ?? ''
          const rendered = formatter ? formatter(raw, name) : `${raw}${entry.unit ?? ''}`
          return (
            <div key={`${name}-${i}`} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              {name && <span className="text-2xs text-muted-foreground">{name}</span>}
              <span className="ml-auto pl-2 font-mono text-xs tabular-nums text-foreground">
                {rendered}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
