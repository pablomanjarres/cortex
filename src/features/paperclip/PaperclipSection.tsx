import { useMemo } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { usePaperclip, type PaperclipHeartbeatRun, type PaperclipAgent } from '@/lib/use-paperclip'
import { Activity, AlertCircle, Bot, CheckCircle2, Clock, Paperclip, RefreshCw, Settings, Zap } from 'lucide-react'

const fmtRelative = (d: string | Date | null | undefined): string => {
  if (!d) return '—'
  const t = typeof d === 'string' ? new Date(d) : d
  const seconds = Math.floor((Date.now() - t.getTime()) / 1000)
  if (Number.isNaN(seconds)) return '—'
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const STATUS_COLORS: Record<string, string> = {
  ok: '#10b981', success: '#10b981', running: '#3b82f6',
  pending: '#f59e0b', error: '#ef4444', failed: '#ef4444', timeout: '#ef4444',
}

const statusColor = (s?: string) => (s ? STATUS_COLORS[s.toLowerCase()] : null) || '#888'
const isErrorStatus = (s?: string) => !!s && /^(error|failed|timeout)$/i.test(s)
const isActiveStatus = (s?: string) => !!s && /^(ok|success|running|live)$/i.test(s)

export function PaperclipSection() {
  const {
    companies, agents, runs, liveRuns,
    selectedCompanyId, setSelectedCompanyId,
    loading, error, lastFetched, refresh,
  } = usePaperclip()

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  )
  const activeAgents = useMemo(() => agents.filter((a) => isActiveStatus(a.status)), [agents])
  const errorAgents = useMemo(() => agents.filter((a) => isErrorStatus(a.status)), [agents])
  const recentRuns = useMemo(() => runs.slice(0, 5), [runs])

  if (error) {
    return (
      <WidgetCard title="Paperclip" description="Agent activity" delay={0}>
        <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 p-3">
          <Settings className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">Paperclip not configured</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Add a <code className="rounded bg-secondary/40 px-1 py-0.5 font-mono text-[10px]">pcp_board_*</code> token in Settings.
            </p>
          </div>
        </div>
      </WidgetCard>
    )
  }

  if (loading && companies.length === 0) {
    return (
      <WidgetCard title="Paperclip" description="Connecting…" delay={0}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-400/70" />
          Polling Paperclip API
        </div>
      </WidgetCard>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            <span>Paperclip</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            {selectedCompany?.name ?? '—'}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              {agents.length} agent{agents.length === 1 ? '' : 's'}
            </span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {liveRuns.length} live · {activeAgents.length} active · {errorAgents.length} in error
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

      {companies.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCompanyId(c.id)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                c.id === selectedCompanyId
                  ? 'border-border bg-secondary/40 text-foreground'
                  : 'border-border/60 bg-secondary/10 text-muted-foreground hover:bg-secondary/20'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile title="Agents" icon={Bot} value={agents.length} sub={`${activeAgents.length} active · ${errorAgents.length} error`} delay={0.05} />
        <Tile title="Live runs" icon={Activity} iconClass="text-blue-400" valueClass="text-blue-400" value={liveRuns.length} sub={recentRuns.length > 0 ? `last ${fmtRelative(recentRuns[0].startedAt)}` : 'idle'} delay={0.1} />
        <Tile title="Recent runs" icon={Clock} value={runs.length} sub="last 20 polled" delay={0.15} />
      </div>

      {errorAgents.length > 0 && (
        <WidgetCard title="Agents in error" description="Heartbeat or last run flagged as failed" variant="urgent" delay={0.2}>
          <div className="space-y-2">
            {errorAgents.map((a) => <AgentRow key={a.id} agent={a} />)}
          </div>
        </WidgetCard>
      )}

      <WidgetCard title="Last 5 heartbeat runs" description="Most recent agent activity" delay={0.25}>
        {recentRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
            <Zap className="mb-2 h-5 w-5 opacity-40" />
            <div>No runs yet</div>
            <div className="mt-1 text-[10px]">Paperclip agents haven't reported in</div>
          </div>
        ) : (
          <div className="space-y-2">
            {recentRuns.map((r) => <RunRow key={r.id} run={r} agents={agents} />)}
          </div>
        )}
      </WidgetCard>
    </div>
  )
}

function Tile({ title, icon: Icon, value, sub, delay, iconClass, valueClass }: {
  title: string; icon: typeof Bot; value: number; sub: string; delay: number; iconClass?: string; valueClass?: string
}) {
  return (
    <WidgetCard title={title} delay={delay} compact className="relative overflow-hidden">
      <div className="absolute right-3 top-3"><Icon className={`h-4 w-4 ${iconClass || 'text-muted-foreground'}`} /></div>
      <div className={`text-2xl font-bold tabular-nums ${valueClass || 'text-foreground'}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{title.toLowerCase()}</div>
      <div className="mt-2 text-xs text-muted-foreground">{sub}</div>
    </WidgetCard>
  )
}

function AgentRow({ agent }: { agent: PaperclipAgent }) {
  const color = statusColor(agent.status)
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card/40 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="truncate font-mono text-sm font-semibold text-foreground">{agent.name}</span>
        </div>
        <div className="mt-0.5 ml-4 truncate text-[11px] text-muted-foreground">
          {agent.status || 'unknown'} · last beat {fmtRelative(agent.lastHeartbeatAt)}
        </div>
      </div>
    </div>
  )
}

function RunRow({ run, agents }: { run: PaperclipHeartbeatRun; agents: PaperclipAgent[] }) {
  const color = statusColor(run.status)
  const agent = agents.find((a) => a.id === run.agentId)
  const isErr = isErrorStatus(run.status)
  const Icon = isErr ? AlertCircle : isActiveStatus(run.status) ? CheckCircle2 : Clock
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card/40 p-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className="h-4 w-4 flex-shrink-0" style={{ color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${color}20`, color }}>
              {run.status}
            </span>
            <span className="truncate font-mono text-xs text-foreground">{agent?.name || run.agentId}</span>
          </div>
          {run.error && (
            <p className="mt-0.5 truncate text-[11px] text-red-300/80" title={run.error}>{run.error}</p>
          )}
        </div>
      </div>
      <div className="ml-3 flex flex-col items-end text-[10px] text-muted-foreground">
        <span className="tabular-nums">{fmtRelative(run.startedAt)}</span>
        {typeof run.exitCode === 'number' && <span className="tabular-nums">exit {run.exitCode}</span>}
      </div>
    </div>
  )
}
