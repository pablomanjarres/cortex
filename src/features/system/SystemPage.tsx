import { useEffect, useRef, useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Cpu, MemoryStick, HardDrive, Activity, Server, AlertCircle, Clock, ShieldCheck, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { SpendSection } from '@/features/spend/SpendPage'
import { PaperclipSection } from '@/features/paperclip/PaperclipSection'
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

type HostKey = 'mac' | 'vm'

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
  { key: 'vm',  label: 'Lima VM', path: '/api/system/vm', noteIfDown: 'VM unreachable or glances service down' },
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

function pctColor(pct: number): string {
  if (pct >= 90) return 'text-red-400'
  if (pct >= 75) return 'text-yellow-400'
  if (pct >= 50) return 'text-amber-300'
  return 'text-emerald-400'
}

function pctBar(pct: number): string {
  if (pct >= 90) return 'bg-red-500/70'
  if (pct >= 75) return 'bg-yellow-500/70'
  if (pct >= 50) return 'bg-amber-500/70'
  return 'bg-emerald-500/70'
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  pct,
}: {
  icon: typeof Cpu
  label: string
  value: string
  sub?: string
  pct?: number
}) {
  const color = pct !== undefined ? pctColor(pct) : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>}
    </div>
  )
}

function Bar({ pct, label, right }: { pct: number; label: string; right?: string }) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={`tabular-nums ${pctColor(clamped)}`}>{right ?? `${clamped.toFixed(1)}%`}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary/40 overflow-hidden">
        <div className={`h-full transition-all duration-700 ${pctBar(clamped)}`} style={{ width: `${clamped}%` }} />
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-yellow-400/70 animate-pulse" />
          Awaiting first sample
        </div>
      </WidgetCard>
    )
  }

  // ── Error state ──
  if (!data && error) {
    return (
      <WidgetCard title={host.label} description="Offline" variant="urgent" delay={delay}>
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">{error}</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">{host.noteIfDown}</p>
          </div>
        </div>
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
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400 animate-pulse'}`} />
            <span>{stale ? 'Reconnecting…' : 'Live'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            <span className="tabular-nums">{data.uptime}</span>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile icon={Cpu} label="CPU" value={`${cpuPct.toFixed(1)}%`} sub={`${cores} cores`} pct={cpuPct} />
          <StatTile
            icon={MemoryStick}
            label="RAM"
            value={`${memPct.toFixed(1)}%`}
            sub={`${fmtBytes(memUsed, 1)} / ${fmtBytes(memTotal, 1)}`}
            pct={memPct}
          />
          <StatTile
            icon={Activity}
            label="Load 1m"
            value={load1.toFixed(2)}
            sub={`${(load1 / Math.max(1, cores) * 100).toFixed(0)}% of ${cores}c`}
            pct={Math.min(100, (load1 / Math.max(1, cores)) * 100)}
          />
          <StatTile
            icon={Server}
            label="Procs"
            value={`${data.processcount?.total ?? 0}`}
            sub={`${data.processcount?.running ?? 0} running`}
          />
        </div>

        {/* CPU + RAM sparklines */}
        <div className="grid grid-cols-2 gap-3">
          <div className={pctColor(cpuPct)}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">CPU history (60s)</div>
            <Sparkline values={cpuHistory.current} max={100} />
          </div>
          <div className={pctColor(memPct)}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">RAM history (60s)</div>
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
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
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
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Network</div>
            {nets.map((n) => (
              <div key={n.interface_name} className="flex items-center justify-between text-[11px] tabular-nums">
                <span className="text-muted-foreground">{n.interface_name}</span>
                <div className="flex gap-3">
                  <span className="text-blue-300">↓ {fmtRate(n.bytes_recv_rate_per_sec ?? 0)}</span>
                  <span className="text-pink-300">↑ {fmtRate(n.bytes_sent_rate_per_sec ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Top processes */}
        {topProcs.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">Top processes</div>
            <div className="flex flex-col gap-0.5 text-[11px]">
              <div className="flex items-center gap-2 text-muted-foreground/50 px-1">
                <span className="flex-1">name</span>
                <span className="w-12 text-right">cpu</span>
                <span className="w-12 text-right">mem</span>
              </div>
              {topProcs.map((p) => (
                <div key={p.pid} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-secondary/20">
                  <span className="flex-1 truncate" title={`${p.name} (pid ${p.pid}, ${p.username})`}>{p.name}</span>
                  <span className={`w-12 text-right tabular-nums ${pctColor(p.cpu_percent)}`}>{p.cpu_percent.toFixed(1)}%</span>
                  <span className="w-12 text-right tabular-nums text-muted-foreground">{p.memory_percent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History expander */}
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center justify-center gap-1.5 mt-1 -mx-1 px-3 py-1.5 rounded-md border border-border bg-secondary/15 hover:bg-secondary/30 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showHistory ? 'Hide history' : 'Show history & averages'}
        </button>
        {showHistory && <HostHistory host={host.key} />}
      </div>
    </WidgetCard>
  )
}

// ── Uptime Kuma panel ─────────────────────────────────────────────────────

interface KumaMonitor { id: number; name: string; type: string }
interface KumaHeartbeat { status: 0 | 1 | 2 | 3; time: string; msg?: string; ping?: number }
interface KumaPayload {
  config?: {
    config: { slug: string; title: string }
    publicGroupList: Array<{ id: number; name: string; monitorList: KumaMonitor[] }>
  }
  heartbeat?: {
    heartbeatList: Record<string, KumaHeartbeat[]>
    uptimeList: Record<string, number>
  }
  error?: string
}

function statusDot(s?: 0 | 1 | 2 | 3): { color: string; label: string } {
  if (s === 1) return { color: 'bg-emerald-400', label: 'Up' }
  if (s === 0) return { color: 'bg-red-400', label: 'Down' }
  if (s === 2) return { color: 'bg-yellow-400', label: 'Pending' }
  if (s === 3) return { color: 'bg-blue-400', label: 'Maint.' }
  return { color: 'bg-zinc-500', label: '—' }
}

function HeartbeatBars({ beats }: { beats: KumaHeartbeat[] }) {
  // Latest 24 beats, oldest left -> newest right
  const last = beats.slice(-24)
  return (
    <div className="flex gap-0.5">
      {last.map((b, i) => {
        const c = b.status === 1 ? 'bg-emerald-400/70' : b.status === 0 ? 'bg-red-400/80' : 'bg-yellow-400/70'
        return <div key={i} className={`h-4 w-1 rounded-sm ${c}`} title={`${b.time} · ${b.status === 1 ? 'up' : b.status === 0 ? 'down' : 'pending'}${b.ping ? ` · ${b.ping}ms` : ''}`} />
      })}
    </div>
  )
}

function UptimePanel({ delay }: { delay: number }) {
  const [data, setData] = useState<KumaPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/uptime`, { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const json = (await r.json()) as KumaPayload
        if (cancelled) return
        if (json.error) throw new Error(json.error)
        setData(json)
        setError(null)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message ?? 'fetch failed')
      } finally {
        if (!cancelled) timer = setTimeout(tick, 10_000)
      }
    }
    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [])

  if (!data && !error) {
    return (
      <WidgetCard title="Uptime Kuma" description="Connecting…" delay={delay}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-yellow-400/70 animate-pulse" />
          Awaiting first poll
        </div>
      </WidgetCard>
    )
  }
  if (!data && error) {
    return (
      <WidgetCard title="Uptime Kuma" description="Offline" variant="urgent" delay={delay}>
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">{error}</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">Lima VM (100.121.121.114:3001) unreachable or status page unpublished</p>
          </div>
        </div>
      </WidgetCard>
    )
  }
  if (!data) return null

  const groups = data.config?.publicGroupList ?? []
  const beats = data.heartbeat?.heartbeatList ?? {}
  const uptimes = data.heartbeat?.uptimeList ?? {}
  const allMonitors = groups.flatMap((g) => g.monitorList)
  const downCount = allMonitors.filter((m) => {
    const last = beats[String(m.id)]?.slice(-1)?.[0]
    return last?.status === 0
  }).length

  return (
    <WidgetCard
      title="Uptime Kuma"
      description={`${data.config?.config.title ?? 'Status'} · ${allMonitors.length} monitors${downCount > 0 ? ` · ${downCount} down` : ''}`}
      variant={downCount > 0 ? 'urgent' : 'default'}
      delay={delay}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" />
            <span>polled every 10s</span>
          </div>
          <a
            href="http://100.121.121.114:3001"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Open Kuma
          </a>
        </div>

        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1.5">
            {groups.length > 1 && (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{group.name}</div>
            )}
            {group.monitorList.map((m) => {
              const mb = beats[String(m.id)] ?? []
              const last = mb[mb.length - 1]
              const dot = statusDot(last?.status)
              const up24 = uptimes[`${m.id}_24`]
              return (
                <div key={m.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${dot.color} ${last?.status === 1 ? 'animate-pulse' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-medium truncate">{m.name}</span>
                      <span className="text-[9px] text-muted-foreground/50 uppercase">{m.type}</span>
                    </div>
                    {last?.msg && last.status !== 1 && (
                      <p className="text-[10px] text-red-300/80 truncate mt-0.5" title={last.msg}>{last.msg}</p>
                    )}
                  </div>
                  <HeartbeatBars beats={mb} />
                  <div className="flex flex-col items-end gap-0 shrink-0 min-w-[64px]">
                    <span className="text-[11px] tabular-nums text-foreground">
                      {up24 != null ? `${(up24 * 100).toFixed(2)}%` : '—'}
                    </span>
                    <span className="text-[9px] text-muted-foreground/60 tabular-nums">
                      {last?.ping != null ? `${last.ping}ms` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </WidgetCard>
  )
}

// ── ADC reauth tile ───────────────────────────────────────────────────────

interface AdcRun {
  id: string
  taskName: string
  timestamp: string
  status: 'success' | 'error' | 'pending-approval'
  summary: string
  fullOutput: string
}

function AdcHealthTile({ delay }: { delay: number }) {
  const [run, setRun] = useState<AdcRun | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/data?key=cortex-automations`, { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const json = (await r.json()) as { runs?: AdcRun[] }
        if (cancelled) return
        const latest = (json.runs ?? []).find((x) => x.taskName === 'adc-health') ?? null
        setRun(latest)
        setError(null)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message ?? 'fetch failed')
      } finally {
        if (!cancelled) timer = setTimeout(tick, 30_000)
      }
    }
    tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [])

  const status = run?.status
  const ageMin = run ? Math.round((Date.now() - new Date(run.timestamp).getTime()) / 60_000) : null
  const stale = ageMin != null && ageMin > 15
  const isUrgent = status === 'error' || stale

  let dotColor = 'bg-zinc-500'
  let pulse = ''
  if (status === 'success' && !stale) { dotColor = 'bg-emerald-400'; pulse = 'animate-pulse' }
  else if (status === 'error') dotColor = 'bg-red-400'
  else if (stale) dotColor = 'bg-yellow-400'

  let body: string
  if (error) body = error
  else if (!run) body = 'Awaiting first watchdog tick (vm-watchdog every 5 min)'
  else if (status === 'error') body = run.summary || 'Reauth needed: gcloud auth application-default login on VM (as openclaw)'
  else if (stale) body = `Last check ${ageMin}m ago — vm-watchdog may be stuck`
  else body = run.summary || 'Vertex/Gemini auth healthy'

  return (
    <WidgetCard
      title="ADC reauth"
      description={run ? `${status === 'success' ? 'Healthy' : 'Reauth needed'}${ageMin != null ? ` · ${ageMin}m ago` : ''}` : 'No data yet'}
      variant={isUrgent ? 'urgent' : 'default'}
      delay={delay}
    >
      <div className="flex items-start gap-3">
        <div className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${dotColor} ${pulse}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground/90 break-words">{body}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">vm-watchdog: ADC token mint check, vertex/gemini auth on Lima VM</p>
        </div>
      </div>
    </WidgetCard>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export function SystemPage() {
  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Hosts, uptime & spend</p>
        </div>
      </div>

      <Tabs defaultValue="live">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="spend">Spend</TabsTrigger>
          <TabsTrigger value="paperclip">Paperclip</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Live host metrics · polled every 2s · history sampled every 5s · powered by Glances
            </p>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {HOSTS.map((host, i) => (
                <HostCard key={host.key} host={host} delay={i * 0.05} />
              ))}
            </div>

            <UptimePanel delay={0.15} />
            <AdcHealthTile delay={0.20} />
          </div>
        </TabsContent>

        <TabsContent value="spend">
          <SpendSection />
        </TabsContent>

        <TabsContent value="paperclip">
          <PaperclipSection />
        </TabsContent>

        <TabsContent value="automations">
          <AutomationsPage />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
