import { useEffect, useRef, useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { Skeleton } from '@/components/shared/Skeleton'
import { Cpu, MemoryStick, HardDrive, Activity, Server, Clock } from 'lucide-react'
import { HostHistory } from './HostHistory'
import { selectPrimaryDisk } from './mac-stats'

// ── Glances /api/4/all payload (subset we use) ────────────────────────────

interface GlancesPayload {
  system: { os_name: string; hostname: string; platform: string; os_version: string; hr_name: string }
  core: { phys: number; log: number }
  cpu: { total: number; user: number; system: number; idle: number; iowait?: number }
  mem: { total: number; used: number; free: number; available: number; percent: number }
  memswap?: { total: number; used: number; percent: number }
  load: { min1: number; min5: number; min15: number; cpucore: number }
  uptime: string
  fs: Array<{ device_name: string; mnt_point: string; size: number; used: number; free: number; percent: number; fs_type: string }>
  network: Array<{ interface_name: string; bytes_recv_rate_per_sec?: number; bytes_sent_rate_per_sec?: number }>
  processcount: { total: number; running: number; sleeping: number; thread: number }
  processlist: Array<{ pid: number; name: string; cpu_percent: number; memory_percent: number; username: string }>
}

type HostKey = 'mac'

interface HostSpec {
  key: HostKey
  label: string
  path: string
  noteIfDown: string
}

// In Electron prod, the renderer is loaded from file:// — relative /api URLs
// don't resolve to the local web server, so fall back to localhost:3456.
// In browser/PWA over Tailscale, same-origin relative paths work directly.
const API_BASE = (typeof window !== 'undefined' && window.location.protocol === 'file:')
  ? 'http://127.0.0.1:3456'
  : ''

const MAC: HostSpec = {
  key: 'mac', label: 'Mac mini', path: '/api/system/mac', noteIfDown: 'glances launchd service not running',
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtBytes(n: number, decimals = 1): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / Math.pow(1024, i)).toFixed(decimals)} ${units[i]}`
}

function fmtRate(bytesPerSec: number): string {
  return `${fmtBytes(bytesPerSec, 1)}/s`
}

/** Gauge text tone — semantic thresholds only (warning >70%, destructive >90%). */
function pctTone(pct: number): string {
  if (pct > 90) return 'text-destructive'
  if (pct > 70) return 'text-warning'
  return ''
}

/** Sparkline stroke tone — accent at rest, semantic past thresholds. */
function sparkTone(pct: number): string {
  return pctTone(pct) || 'text-accent'
}

/** Gauge fill — accent at rest, semantic past thresholds (meter convention). */
function barTone(pct: number): string {
  if (pct > 90) return 'bg-destructive'
  if (pct > 70) return 'bg-warning'
  return 'bg-accent'
}

// ── Sub-components ────────────────────────────────────────────────────────

function Bar({ pct, label, right }: { pct: number; label: string; right?: string }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-2xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono tabular-nums ${pctTone(clamped) || 'text-muted-foreground'}`}>
          {right ?? `${clamped.toFixed(1)}%`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/40">
        <div
          className={`h-full motion-safe:transition-all motion-safe:duration-700 ${barTone(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

function Sparkline({ values, max = 100 }: { values: number[]; max?: number }) {
  if (values.length === 0) return <div className="h-24" />
  const w = 200
  const h = 96
  const stepX = values.length > 1 ? w / (values.length - 1) : 0
  const points = values.map((v, i) => {
    const y = h - (Math.max(0, Math.min(max, v)) / max) * h
    return `${(i * stepX).toFixed(2)},${y.toFixed(2)}`
  })
  const path = `M ${points.join(' L ')}`
  const area = `${path} L ${w},${h} L 0,${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-24 w-full">
      <path d={area} fill="currentColor" opacity="0.15" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function TrendPanel({ label, value, values }: { label: string; value: number; values: number[] }) {
  return (
    <div className={sparkTone(value)}>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="font-mono text-xl tabular-nums">{value.toFixed(1)}%</span>
      </div>
      <Sparkline values={values} />
      <div className="mt-2 flex justify-between font-mono text-3xs text-foreground-faint">
        <span>60s ago</span>
        <span>Now</span>
      </div>
    </div>
  )
}

// ── Per-host card ─────────────────────────────────────────────────────────

function HostCard({ host, delay }: { host: HostSpec; delay: number }) {
  const [data, setData] = useState<GlancesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const cpuHistory = useRef<number[]>([])
  const memHistory = useRef<number[]>([])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE}${host.path}`, { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const json = (await r.json()) as GlancesPayload
        if (cancelled) return
        setData(json)
        setError(null)
        setStale(false)
        cpuHistory.current = [...cpuHistory.current, json.cpu?.total ?? 0].slice(-30)
        memHistory.current = [...memHistory.current, json.mem?.percent ?? 0].slice(-30)
      } catch (e: unknown) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'fetch failed')
        setStale(true)
      } finally {
        if (!cancelled) timer = setTimeout(tick, 2000)
      }
    }

    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [host.path])

  // ── Loading state ──
  if (!data && !error) {
    return (
      <WidgetCard title={host.label} description="Connecting…" delay={delay}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      </WidgetCard>
    )
  }

  // ── Error state ──
  if (!data && error) {
    return (
      <WidgetCard title={host.label} description="Offline" variant="urgent" delay={delay}>
        <p className="text-xs text-destructive">{error}</p>
        <p className="mt-1 text-2xs text-foreground-faint">{host.noteIfDown}</p>
      </WidgetCard>
    )
  }

  if (!data) return null

  // ── Live data ──
  const sys = data.system
  const cpuPct = data.cpu?.total ?? 0
  const memPct = data.mem?.percent ?? 0
  const memUsed = data.mem?.used ?? 0
  const memTotal = data.mem?.total ?? 0
  const swap = data.memswap
  const load1 = data.load?.min1 ?? 0
  const cores = data.load?.cpucore ?? data.core?.log ?? 1
  const loadPct = Math.min(100, (load1 / Math.max(1, cores)) * 100)

  const disk = selectPrimaryDisk(data.fs || [])

  const nets = (data.network || [])
    .filter((n) =>
      !n.interface_name.startsWith('lo') &&
      !n.interface_name.startsWith('utun') &&
      !n.interface_name.startsWith('llw') &&
      !n.interface_name.startsWith('awdl') &&
      !n.interface_name.startsWith('anpi') &&
      !n.interface_name.startsWith('veth') &&
      !n.interface_name.startsWith('docker') &&
      !n.interface_name.startsWith('br-') &&
      ((n.bytes_recv_rate_per_sec ?? 0) + (n.bytes_sent_rate_per_sec ?? 0)) > 0
    )
    .sort((a, b) =>
      ((b.bytes_recv_rate_per_sec ?? 0) + (b.bytes_sent_rate_per_sec ?? 0)) -
      ((a.bytes_recv_rate_per_sec ?? 0) + (a.bytes_sent_rate_per_sec ?? 0))
    )
    .slice(0, 3)

  const topProcs = (data.processlist || [])
    .filter((p) => p.cpu_percent > 0 || p.memory_percent > 0.5)
    .sort((a, b) => b.cpu_percent - a.cpu_percent)
    .slice(0, 6)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        kicker="Live host"
        title={host.label}
        subtitle={`${sys.hostname} · ${sys.os_name} ${sys.os_version}`}
        actions={(
          <div className="flex items-center gap-3 font-mono text-2xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full motion-safe:animate-pulse ${stale ? 'bg-warning' : 'bg-success'}`} />
              {stale ? 'Reconnecting…' : 'Live'}
            </span>
            <span className="flex items-center gap-1.5 tabular-nums">
              <Clock className="h-3 w-3" />{data.uptime}
            </span>
          </div>
        )}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="CPU"
          icon={<Cpu />}
          value={<span className={pctTone(cpuPct)}>{`${cpuPct.toFixed(1)}%`}</span>}
          sub={`${cores} cores`}
        />
        <StatTile
          label="RAM"
          icon={<MemoryStick />}
          value={<span className={pctTone(memPct)}>{`${memPct.toFixed(1)}%`}</span>}
          sub={`${fmtBytes(memUsed, 1)} / ${fmtBytes(memTotal, 1)}`}
        />
        <StatTile
          label="Load 1m"
          icon={<Activity />}
          value={<span className={pctTone(loadPct)}>{load1.toFixed(2)}</span>}
          sub={`${(load1 / Math.max(1, cores) * 100).toFixed(0)}% of ${cores}c`}
        />
        <StatTile
          label="Procs"
          icon={<Server />}
          value={`${data.processcount?.total ?? 0}`}
          sub={`${data.processcount?.running ?? 0} running`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <WidgetCard title="Live activity" description="CPU and memory · last 60 seconds" delay={delay} className="min-w-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <TrendPanel label="CPU" value={cpuPct} values={cpuHistory.current} />
            <TrendPanel label="RAM" value={memPct} values={memHistory.current} />
          </div>
        </WidgetCard>

        <WidgetCard title="Memory & swap" description="Physical and virtual memory" delay={delay + 0.05}>
          <div className="flex flex-col gap-5">
            <Bar pct={memPct} label="Memory" right={`${fmtBytes(memUsed, 1)} / ${fmtBytes(memTotal, 1)}`} />
            {swap && swap.total > 0 && (
              <Bar pct={swap.percent} label="Swap" right={`${fmtBytes(swap.used, 1)} / ${fmtBytes(swap.total, 1)}`} />
            )}
          </div>
        </WidgetCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <WidgetCard
          title="Storage"
          description={disk?.mnt_point === '/System/Volumes/Data' ? 'Macintosh HD · Data volume' : disk?.mnt_point ?? 'Primary volume'}
          delay={delay + 0.1}
        >
          {disk ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline gap-2">
                <HardDrive className="size-4 shrink-0 text-foreground-faint" />
                <span className="font-mono text-2xl tabular-nums text-foreground">{fmtBytes(disk.used)}</span>
                <span className="text-xs text-muted-foreground">used</span>
              </div>
              <Bar pct={disk.percent} label="Storage used" right={`${disk.percent.toFixed(1)}%`} />
              <div className="flex justify-between font-mono text-2xs text-foreground-faint">
                <span>{fmtBytes(disk.free)} available</span>
                <span>{fmtBytes(disk.size)} total</span>
              </div>
            </div>
          ) : <p className="text-xs text-foreground-faint">Storage data unavailable.</p>}
        </WidgetCard>

        <WidgetCard title="Network" description="Active interfaces · current throughput" delay={delay + 0.15}>
          {nets.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {nets.map((n) => (
                <div key={n.interface_name} className="flex flex-col gap-1 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <span className="font-mono text-xs text-foreground">{n.interface_name}</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-2xs tabular-nums">
                    <span className="text-accent">↓ {fmtRate(n.bytes_recv_rate_per_sec ?? 0)}</span>
                    <span className="text-muted-foreground">↑ {fmtRate(n.bytes_sent_rate_per_sec ?? 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-foreground-faint">No active network traffic.</p>}
        </WidgetCard>

        <WidgetCard title="Top processes" description="Sorted by CPU use" delay={delay + 0.2}>
          {topProcs.length > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="flex flex-col gap-0.5 font-mono text-2xs">
                <div className="flex items-center gap-2 px-1 text-3xs uppercase tracking-wider text-foreground-faint">
                  <span className="flex-1">name</span>
                  <span className="w-12 text-right">cpu</span>
                  <span className="w-12 text-right">mem</span>
                </div>
                {topProcs.map((p) => (
                  <div key={p.pid} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-secondary/20">
                    <span className="flex-1 truncate text-muted-foreground" title={`${p.name} (pid ${p.pid}, ${p.username})`}>{p.name}</span>
                    <span className={`w-12 text-right tabular-nums ${pctTone(p.cpu_percent) || 'text-foreground'}`}>{p.cpu_percent.toFixed(1)}%</span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">{p.memory_percent.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-foreground-faint">No process data available.</p>}
        </WidgetCard>
      </div>

      <WidgetCard title="History & averages" description="Recorded Mac activity · 15 minutes to 7 days" delay={delay + 0.25}>
        <HostHistory host={host.key} />
      </WidgetCard>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export function SystemPage() {
  return (
    <PageShell>
      <p className="font-mono text-2xs text-foreground-faint">
        Live Mac metrics · polled every 2s · history sampled every 5s · powered by Glances
      </p>
      <HostCard host={MAC} delay={0} />
    </PageShell>
  )
}
