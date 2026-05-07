import { useMemo } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { useRealtimeSpend } from '@/lib/use-realtime-spend'
import {
  Activity,
  AlertCircle,
  Bot,
  Cloud,
  DollarSign,
  RefreshCw,
  Server,
  Zap,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtUSD = (n: number) => {
  if (n === 0) return '$0.00'
  if (Math.abs(n) >= 1000) return `$${n.toFixed(0)}`
  if (Math.abs(n) >= 10) return `$${n.toFixed(2)}`
  if (Math.abs(n) >= 0.01) return `$${n.toFixed(3)}`
  return `$${n.toFixed(5)}`
}

const fmtRate = (n: number) => {
  if (n === 0) return '$0/hr'
  if (Math.abs(n) >= 10) return `$${n.toFixed(2)}/hr`
  if (Math.abs(n) >= 0.01) return `$${n.toFixed(3)}/hr`
  return `$${n.toFixed(5)}/hr`
}

const fmtTokens = (n: number | null) => {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

const fmtRelative = (date: Date | string | null) => {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const SERVICE_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  gcp: 'GCP',
  gcp_vm: 'VM',
}

const SERVICE_COLORS: Record<string, string> = {
  anthropic: '#d97757',
  gcp: '#4285f4',
  gcp_vm: '#fbbc04',
}

const SERVICE_ICONS: Record<string, typeof Bot> = {
  anthropic: Bot,
  gcp: Cloud,
  gcp_vm: Server,
}

// ── Section (renders inside SystemPage's PageShell) ──────────────────────────

export function SpendSection() {
  const { today, month, buckets24h, burnRate, vmStatus, loading, error, lastFetched, refresh } =
    useRealtimeSpend(30_000)

  // Total today across all services
  const totalToday = useMemo(
    () => today.reduce((s, r) => s + Number(r.cost_usd || 0), 0),
    [today]
  )
  const totalMonth = useMemo(
    () => month.reduce((s, r) => s + Number(r.cost_usd || 0), 0),
    [month]
  )
  const totalBurnRate = useMemo(
    () => burnRate.reduce((s, r) => s + Number(r.usd_per_hour || 0), 0),
    [burnRate]
  )

  // Group today by service
  const todayByService = useMemo(() => {
    const acc: Record<string, { service: string; total: number; rows: typeof today }> = {}
    for (const row of today) {
      const k = row.service
      if (!acc[k]) acc[k] = { service: k, total: 0, rows: [] }
      acc[k].total += Number(row.cost_usd || 0)
      acc[k].rows.push(row)
    }
    return Object.values(acc).sort((a, b) => b.total - a.total)
  }, [today])

  // 24h chart: pivot to wide format with one column per service
  const chart24h = useMemo(() => {
    type Row = { hour: string; label: string; [service: string]: string | number }
    const byHour: Record<string, Row> = {}
    for (const r of buckets24h) {
      const hour = new Date(r.hour).toISOString()
      const label = new Date(r.hour).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      if (!byHour[hour]) byHour[hour] = { hour, label }
      const prev = Number(byHour[hour][r.service] || 0)
      byHour[hour][r.service] = prev + Number(r.cost_usd || 0)
    }
    return Object.values(byHour).sort((a, b) => a.hour.localeCompare(b.hour))
  }, [buckets24h])

  const services24h = useMemo(() => {
    const set = new Set<string>()
    for (const r of buckets24h) set.add(r.service)
    return Array.from(set)
  }, [buckets24h])

  // Per-model breakdown (Anthropic via Vertex + Gemini under gcp)
  const modelRows = useMemo(() => {
    return today
      .filter(
        (r) =>
          r.service === 'anthropic' ||
          (r.service === 'gcp' && /^(claude|gemini|gpt)/i.test(r.model))
      )
      .filter((r) => r.model)
      .sort((a, b) => Number(b.cost_usd) - Number(a.cost_usd))
  }, [today])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Activity className="h-3 w-3" />
            <span>Realtime Spend</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            {loading && !lastFetched ? '—' : fmtUSD(totalToday)}{' '}
            <span className="text-base font-normal text-muted-foreground">today</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            burning {fmtRate(totalBurnRate)} · {fmtUSD(totalMonth)} this month · net of credits
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          {fmtRelative(lastFetched)}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/[0.06] p-3 text-xs text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <div className="font-semibold">Can't reach Supabase</div>
            <div className="mt-0.5 text-red-300/80">{error}</div>
          </div>
        </div>
      )}

      {/* Per-service tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(['anthropic', 'gcp', 'gcp_vm'] as const).map((svc, i) => {
          const tile = todayByService.find((s) => s.service === svc)
          const rate = burnRate.find((r) => r.service === svc)
          const Icon = SERVICE_ICONS[svc] || DollarSign
          const color = SERVICE_COLORS[svc]
          return (
            <WidgetCard
              key={svc}
              title={SERVICE_LABELS[svc]}
              delay={i * 0.05}
              compact
              className="relative overflow-hidden"
            >
              <div className="absolute right-3 top-3">
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
              <div className="text-2xl font-bold tabular-nums" style={{ color }}>
                {fmtUSD(tile?.total || 0)}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                today
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {rate?.usd_per_hour ? fmtRate(Number(rate.usd_per_hour)) : 'idle'}
              </div>
            </WidgetCard>
          )
        })}
      </div>

      {/* 24h stacked area */}
      <WidgetCard title="Last 24 hours" description="Hourly spend stacked by service" delay={0.2}>
        {chart24h.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart24h}>
                <XAxis dataKey="label" stroke="#666" fontSize={10} tickLine={false} />
                <YAxis stroke="#666" fontSize={10} tickFormatter={(v) => fmtUSD(v)} />
                <Tooltip
                  contentStyle={{
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v, name) => [fmtUSD(Number(v)), SERVICE_LABELS[String(name)] || String(name)]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => SERVICE_LABELS[v] || v} />
                {services24h.map((svc) => (
                  <Area
                    key={svc}
                    type="monotone"
                    dataKey={svc}
                    stackId="1"
                    stroke={SERVICE_COLORS[svc] || '#888'}
                    fill={SERVICE_COLORS[svc] || '#888'}
                    fillOpacity={0.35}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </WidgetCard>

      {/* Per-model breakdown */}
      <div className="grid gap-3 lg:grid-cols-2">
        <WidgetCard title="AI by model" description="Today's spend per model" delay={0.25}>
          {modelRows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {modelRows.map((row) => {
                const maxCost = Math.max(...modelRows.map((r) => Number(r.cost_usd)))
                const pct = maxCost > 0 ? (Number(row.cost_usd) / maxCost) * 100 : 0
                const color = SERVICE_COLORS[row.service] || '#888'
                return (
                  <div key={`${row.service}-${row.model}`} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: `${color}20`, color }}
                        >
                          {SERVICE_LABELS[row.service]}
                        </span>
                        <span className="font-mono text-foreground">{row.model}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground tabular-nums">
                          {fmtTokens(row.usage_units)} {row.unit_label || 'tokens'}
                        </span>
                        <span className="font-semibold tabular-nums" style={{ color }}>
                          {fmtUSD(Number(row.cost_usd))}
                        </span>
                      </div>
                    </div>
                    <div className="h-1 w-full rounded-full bg-muted">
                      <div
                        className="h-1 rounded-full"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="VM live status" description="Per-instance compute spend" delay={0.3}>
          {vmStatus.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {vmStatus.map((vm) => {
                const isRunning = vm.status === 'RUNNING'
                return (
                  <div
                    key={vm.vm_name}
                    className="flex items-center justify-between rounded-lg border border-border bg-card/40 p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            isRunning ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-zinc-500'
                          }`}
                        />
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {vm.vm_name}
                        </span>
                      </div>
                      <div className="mt-0.5 ml-4 text-[11px] text-muted-foreground">
                        {vm.machine_type || '—'} · {vm.zone || '—'} · {vm.status || 'unknown'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-sm font-bold tabular-nums"
                        style={{ color: SERVICE_COLORS.gcp_vm }}
                      >
                        {fmtRate(Number(vm.projected_usd_per_hour || 0))}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {fmtRelative(vm.updated_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </WidgetCard>
      </div>

      {/* Today rollup table */}
      <WidgetCard title="Today's rollup" description="All services and resources" delay={0.35}>
        {today.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-1.5">Service</th>
                  <th>Model / Resource</th>
                  <th className="text-right">Usage</th>
                  <th className="text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {today
                  .slice()
                  .sort((a, b) => Number(b.cost_usd) - Number(a.cost_usd))
                  .map((row, i) => {
                    const color = SERVICE_COLORS[row.service] || '#888'
                    return (
                      <tr key={i} className="border-t border-border/40">
                        <td className="py-1.5">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: `${color}20`, color }}
                          >
                            {SERVICE_LABELS[row.service] || row.service}
                          </span>
                        </td>
                        <td className="font-mono text-muted-foreground">
                          {row.model || row.resource || '—'}
                        </td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {fmtTokens(row.usage_units)} {row.unit_label || ''}
                        </td>
                        <td className="text-right font-semibold tabular-nums" style={{ color }}>
                          {fmtUSD(Number(row.cost_usd))}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
      <Zap className="mb-2 h-5 w-5 opacity-40" />
      <div>No data yet</div>
      <div className="mt-1 text-[10px]">n8n flows haven't pushed any rows</div>
    </div>
  )
}
