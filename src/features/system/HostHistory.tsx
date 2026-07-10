import { useEffect, useState } from 'react'
import { AreaChart, Area, Line, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Activity, Cpu, MemoryStick } from 'lucide-react'
import { Chip } from '@/components/ui/chip'
import { Skeleton } from '@/components/shared/Skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { ThemedTooltip, axisProps, chartColors, cssVar } from '@/lib/chart-theme'

type HostKey = 'mac'
type WindowKey = '15m' | '1h' | '6h' | '24h' | '3d' | '7d'

interface HistoryBucket {
  t: number
  cpu: number; cpuMax: number
  mem: number; memMax: number
  load1: number; load1Max: number
  rxBps: number
  txBps: number
}

interface HistoryStat { avg: number; min: number; max: number }

interface HistoryPayload {
  host: HostKey
  windowMs: number
  count: number
  bucketMs?: number
  samples: HistoryBucket[]
  stats: { cpu: HistoryStat; mem: HistoryStat; load1: HistoryStat; swap: HistoryStat }
  latest: { cores?: number } | null
}

const WINDOWS: { key: WindowKey; label: string; ms: number }[] = [
  { key: '15m', label: '15m', ms: 15 * 60 * 1000 },
  { key: '1h',  label: '1h',  ms: 1 * 3600 * 1000 },
  { key: '6h',  label: '6h',  ms: 6 * 3600 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 3600 * 1000 },
  { key: '3d',  label: '3d',  ms: 3 * 24 * 3600 * 1000 },
  { key: '7d',  label: '7d',  ms: 7 * 24 * 3600 * 1000 },
]

const API_BASE = (typeof window !== 'undefined' && window.location.protocol === 'file:')
  ? 'http://127.0.0.1:3456'
  : ''

function fmtTime(t: number, windowMs: number): string {
  const d = new Date(t)
  // ≤24h: HH:mm
  if (windowMs <= 24 * 3600 * 1000) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  // >24h: short date + hour
  return d.toLocaleString('en-US', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', hour12: false,
  })
}

function fmtPct(n: number): string { return `${n.toFixed(1)}%` }
function fmtLoad(n: number): string { return n.toFixed(2) }

function StatRow({ icon: Icon, label, stat, format = fmtPct, color }: {
  icon: typeof Cpu
  label: string
  stat: HistoryStat
  format?: (n: number) => string
  /** Series color (token-derived via chartColors) linking this stat to its chart series */
  color: string
}) {
  return (
    <div className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" style={{ color }} />
        {label}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="font-mono text-lg font-medium tabular-nums text-foreground">{format(stat.avg)}</div>
          <div className="font-mono text-3xs uppercase tracking-wider text-foreground-faint">avg</div>
        </div>
        <div>
          <div className="font-mono text-sm tabular-nums text-muted-foreground">{format(stat.min)}</div>
          <div className="font-mono text-3xs uppercase tracking-wider text-foreground-faint">min</div>
        </div>
        <div>
          <div className="font-mono text-sm tabular-nums text-foreground">{format(stat.max)}</div>
          <div className="font-mono text-3xs uppercase tracking-wider text-foreground-faint">max</div>
        </div>
      </div>
    </div>
  )
}

export function HostHistory({ host }: { host: HostKey }) {
  const [windowKey, setWindowKey] = useState<WindowKey>('1h')
  const [data, setData] = useState<HistoryPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/system/history?host=${host}&window=${windowKey}`, { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const json = (await r.json()) as HistoryPayload
        if (cancelled) return
        setData(json)
        setError(null)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message ?? 'fetch failed')
      } finally {
        if (!cancelled) {
          setLoading(false)
          timer = setTimeout(tick, 30_000)
        }
      }
    }

    setLoading(true)
    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [host, windowKey])

  const samples = data?.samples ?? []
  const cores = data?.latest?.cores ?? 1
  const loadCeiling = Math.max(1, cores)
  const chartData = samples.map((s) => ({
    label: fmtTime(s.t, data?.windowMs ?? 3600_000),
    cpu: Number(s.cpu.toFixed(2)),
    cpuMax: Number(s.cpuMax.toFixed(2)),
    mem: Number(s.mem.toFixed(2)),
    memMax: Number(s.memMax.toFixed(2)),
    load1: Number(s.load1.toFixed(3)),
    load1Max: Number(s.load1Max.toFixed(3)),
  }))

  // Multi-series family from chart-theme: cpu = accent, mem = green, load = amber.
  const [cCpu, cMem, cLoad] = chartColors()

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-border/60 pt-4">
      {/* Header + window selector */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3 w-3" />
          History
          {data && data.count > 0 && (
            <span className="ml-1 normal-case tracking-normal text-foreground-faint">
              · {data.count} samples
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {WINDOWS.map((w) => (
            <Chip
              key={w.key}
              selectable
              size="sm"
              selected={windowKey === w.key}
              onClick={() => setWindowKey(w.key)}
            >
              {w.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Loading / empty / error states */}
      {loading && !data && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="h-44 w-full" />
        </div>
      )}

      {error && !data && (
        <div className="py-2">
          <p className="text-xs text-destructive">{error}</p>
          <p className="mt-0.5 text-2xs text-foreground-faint">
            History is sampled every 5s by Cortex; samples accumulate while the app is running.
          </p>
        </div>
      )}

      {data && data.count === 0 && (
        <EmptyState
          className="py-4"
          message="No samples yet for this window."
          hint="History fills in as Cortex runs."
        />
      )}

      {data && data.count > 0 && (
        <>
          {/* Stat rows */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <StatRow icon={Cpu} label="CPU" stat={data.stats.cpu} color={cCpu} />
            <StatRow icon={MemoryStick} label="RAM" stat={data.stats.mem} color={cMem} />
            <StatRow icon={Activity} label={`Load 1m (${cores}c)`} stat={data.stats.load1} format={fmtLoad} color={cLoad} />
          </div>

          {/* CPU + RAM chart */}
          <div className="rounded-md border border-border/60 p-3">
            <div className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
              CPU & RAM over {WINDOWS.find((w) => w.key === windowKey)?.label}
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" {...axisProps()} minTickGap={40} />
                  <YAxis width={36} domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axisProps()} />
                  <Tooltip
                    content={<ThemedTooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />}
                    cursor={{ stroke: cssVar('--border') }}
                  />
                  <Area type="monotone" dataKey="cpuMax" name="CPU max" stroke="none" fill={cCpu} fillOpacity={0.08} />
                  <Area type="monotone" dataKey="cpu" name="CPU avg" stroke={cCpu} strokeWidth={1.5} fill={cCpu} fillOpacity={0.25} />
                  <Area type="monotone" dataKey="memMax" name="RAM max" stroke="none" fill={cMem} fillOpacity={0.08} />
                  <Area type="monotone" dataKey="mem" name="RAM avg" stroke={cMem} strokeWidth={1.5} fill={cMem} fillOpacity={0.18} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Load chart */}
          <div className="rounded-md border border-border/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                Load (1m) — saturation line at {loadCeiling}
              </div>
              <div className="font-mono text-2xs tabular-nums text-foreground-faint">
                avg {fmtLoad(data.stats.load1.avg)} · max {fmtLoad(data.stats.load1.max)}
              </div>
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" {...axisProps()} minTickGap={40} />
                  <YAxis width={36} domain={[0, (dmax: number) => Math.max(loadCeiling * 1.1, dmax * 1.05)]} {...axisProps()} />
                  <Tooltip
                    content={<ThemedTooltip formatter={(v) => Number(v).toFixed(2)} />}
                    cursor={{ stroke: cssVar('--border') }}
                  />
                  <ReferenceLine y={loadCeiling} stroke={cssVar('--destructive')} strokeDasharray="3 3" strokeOpacity={0.6} />
                  <Area type="monotone" dataKey="load1Max" name="Load max" stroke="none" fill={cLoad} fillOpacity={0.08} />
                  <Line type="monotone" dataKey="load1" name="Load" stroke={cLoad} strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
