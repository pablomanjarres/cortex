import { useEffect, useState } from 'react'
import { AreaChart, Area, Line, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Activity, Cpu, MemoryStick, Loader2, AlertCircle } from 'lucide-react'

type HostKey = 'mac' | 'vm'
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
  color: string
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/15 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
        <Icon className="h-3 w-3" style={{ color }} />
        {label}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold tabular-nums" style={{ color }}>{format(stat.avg)}</div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50">avg</div>
        </div>
        <div>
          <div className="text-sm font-medium tabular-nums text-muted-foreground">{format(stat.min)}</div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50">min</div>
        </div>
        <div>
          <div className="text-sm font-medium tabular-nums text-foreground">{format(stat.max)}</div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50">max</div>
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

  return (
    <div className="flex flex-col gap-4 mt-4 pt-4 border-t border-border/40">
      {/* Header + window selector */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
          <Activity className="h-3 w-3" />
          History
          {data && data.count > 0 && (
            <span className="ml-1 text-muted-foreground/50 normal-case tracking-normal">
              · {data.count} samples
            </span>
          )}
        </div>
        <div className="inline-flex rounded-md border border-border bg-secondary/30 p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWindowKey(w.key)}
              className={`px-2 py-0.5 text-[11px] rounded-sm tabular-nums transition-colors ${
                windowKey === w.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / empty / error states */}
      {loading && !data && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading history…
        </div>
      )}

      {error && !data && (
        <div className="flex items-start gap-2 text-xs text-red-300 py-3">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <div>{error}</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">
              History is sampled every 5s by Cortex; samples accumulate while the app is running.
            </div>
          </div>
        </div>
      )}

      {data && data.count === 0 && (
        <div className="text-xs text-muted-foreground py-4 text-center">
          No samples yet for this window. History fills in as Cortex runs.
        </div>
      )}

      {data && data.count > 0 && (
        <>
          {/* Stat rows */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <StatRow icon={Cpu} label="CPU" stat={data.stats.cpu} color="#10b981" />
            <StatRow icon={MemoryStick} label="RAM" stat={data.stats.mem} color="#60a5fa" />
            <StatRow icon={Activity} label={`Load 1m (${cores}c)`} stat={data.stats.load1} format={fmtLoad} color="#f59e0b" />
          </div>

          {/* CPU + RAM chart */}
          <div className="rounded-lg border border-border bg-secondary/10 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2">
              CPU & RAM over {WINDOWS.find((w) => w.key === windowKey)?.label}
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" stroke="#666" fontSize={10} tickLine={false} minTickGap={40} />
                  <YAxis stroke="#666" fontSize={10} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 6, fontSize: 11 }}
                    formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name === 'cpu' ? 'CPU avg' : name === 'cpuMax' ? 'CPU max' : name === 'mem' ? 'RAM avg' : 'RAM max']}
                  />
                  <Area type="monotone" dataKey="cpuMax" stroke="none" fill="#10b981" fillOpacity={0.08} />
                  <Area type="monotone" dataKey="cpu" stroke="#10b981" strokeWidth={1.5} fill="#10b981" fillOpacity={0.25} />
                  <Area type="monotone" dataKey="memMax" stroke="none" fill="#60a5fa" fillOpacity={0.08} />
                  <Area type="monotone" dataKey="mem" stroke="#60a5fa" strokeWidth={1.5} fill="#60a5fa" fillOpacity={0.18} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Load chart */}
          <div className="rounded-lg border border-border bg-secondary/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                Load (1m) — saturation line at {loadCeiling}
              </div>
              <div className="text-[10px] text-muted-foreground/50 tabular-nums">
                avg {fmtLoad(data.stats.load1.avg)} · max {fmtLoad(data.stats.load1.max)}
              </div>
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" stroke="#666" fontSize={10} tickLine={false} minTickGap={40} />
                  <YAxis stroke="#666" fontSize={10} domain={[0, (dmax: number) => Math.max(loadCeiling * 1.1, dmax * 1.05)]} />
                  <Tooltip
                    contentStyle={{ background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 6, fontSize: 11 }}
                    formatter={(v) => [Number(v).toFixed(2), 'Load']}
                  />
                  <ReferenceLine y={loadCeiling} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.6} />
                  <Area type="monotone" dataKey="load1Max" stroke="none" fill="#f59e0b" fillOpacity={0.08} />
                  <Line type="monotone" dataKey="load1" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
