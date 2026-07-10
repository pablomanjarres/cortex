import { useEffect, useRef, useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { Skeleton } from '@/components/shared/Skeleton'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Cpu, MemoryStick, HardDrive, Activity, Server, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { AutomationsPage } from '@/features/automations/AutomationsPage'
import { HostHistory } from './HostHistory'

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

const HOSTS: HostSpec[] = [
  { key: 'mac', label: 'Mac mini', path: '/api/system/mac', noteIfDown: 'glances launchd service not running' },
]

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
  if (values.length === 0) return <div className="h-8" />
  const w = 200
  const h = 32
  const stepX = values.length > 1 ? w / (values.length - 1) : 0
  const points = values.map((v, i) => {
    const y = h - (Math.max(0, Math.min(max, v)) / max) * h
    return `${(i * stepX).toFixed(2)},${y.toFixed(2)}`
  })
  const path = `M ${points.join(' L ')}`
  const area = `${path} L ${w},${h} L 0,${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full">
      <path d={area} fill="currentColor" opacity="0.15" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Per-host card ─────────────────────────────────────────────────────────

function HostCard({ host, delay }: { host: HostSpec; delay: number }) {
  const [data, setData] = useState<GlancesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
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
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message ?? 'fetch failed')
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

  const fsList = (data.fs || [])
    .filter((f) => f.size > 1024 * 1024 * 1024) // >1GB
    .sort((a, b) => b.size - a.size)
    .slice(0, 4)

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
    <WidgetCard
      title={host.label}
      description={`${sys.hostname} · ${sys.os_name} ${sys.os_version}`}
      delay={delay}
    >
      <div className="flex flex-col gap-4">
        {/* Live indicator + uptime */}
        <div className="flex items-center justify-between text-2xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full motion-safe:animate-pulse ${stale ? 'bg-warning' : 'bg-success'}`} />
            <span>{stale ? 'Reconnecting…' : 'Live'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            <span className="font-mono tabular-nums">{data.uptime}</span>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

        {/* CPU + RAM sparklines */}
        <div className="grid grid-cols-2 gap-3">
          <div className={sparkTone(cpuPct)}>
            <div className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground">CPU history (60s)</div>
            <Sparkline values={cpuHistory.current} max={100} />
          </div>
          <div className={sparkTone(memPct)}>
            <div className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground">RAM history (60s)</div>
            <Sparkline values={memHistory.current} max={100} />
          </div>
        </div>

        {/* Memory + swap bars */}
        <div className="flex flex-col gap-2.5">
          <Bar pct={memPct} label="Memory" right={`${fmtBytes(memUsed, 1)} used`} />
          {swap && swap.total > 0 && (
            <Bar pct={swap.percent} label="Swap" right={`${fmtBytes(swap.used, 1)} / ${fmtBytes(swap.total, 1)}`} />
          )}
        </div>

        {/* Disk */}
        {fsList.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
              <HardDrive className="h-3 w-3" />
              Disk
            </div>
            {fsList.map((fs) => (
              <Bar
                key={fs.mnt_point}
                pct={fs.percent}
                label={`${fs.mnt_point} (${fs.fs_type})`}
                right={`${fmtBytes(fs.used, 1)} / ${fmtBytes(fs.size, 1)}`}
              />
            ))}
          </div>
        )}

        {/* Network */}
        {nets.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Network</div>
            {nets.map((n) => (
              <div key={n.interface_name} className="flex items-center justify-between text-2xs">
                <span className="font-mono text-muted-foreground">{n.interface_name}</span>
                <div className="flex gap-3 font-mono tabular-nums">
                  <span className="text-muted-foreground">↓ {fmtRate(n.bytes_recv_rate_per_sec ?? 0)}</span>
                  <span className="text-foreground-faint">↑ {fmtRate(n.bytes_sent_rate_per_sec ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Top processes */}
        {topProcs.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="mb-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground">Top processes</div>
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
        )}

        {/* History expander */}
        <Button variant="secondary" size="sm" className="mt-1 w-full" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? <ChevronUp /> : <ChevronDown />}
          {showHistory ? 'Hide history' : 'Show history & averages'}
        </Button>
        {showHistory && <HostHistory host={host.key} />}
      </div>
    </WidgetCard>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export function SystemPage() {
  return (
    <PageShell>
      <Tabs defaultValue="live">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <div className="flex flex-col gap-4">
            <p className="font-mono text-2xs text-foreground-faint">
              Live host metrics · polled every 2s · history sampled every 5s · powered by Glances
            </p>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {HOSTS.map((host, i) => (
                <HostCard key={host.key} host={host} delay={i * 0.05} />
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="automations">
          <AutomationsPage />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
