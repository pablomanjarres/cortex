import { useState, useEffect, useMemo } from 'react'
import Markdown from 'react-markdown'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Button } from '@/components/ui/button'
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronLeft,
  Server,
  Code,
  Brain,
  Flame,
  Search,
  FileText,
  ArrowRight,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface AutomationRun {
  id: string
  taskName: string
  timestamp: string
  status: 'success' | 'error' | 'pending-approval'
  summary: string
  fullOutput: string
  approved?: boolean
}

type TaskType = 'claude' | 'launchd' | 'cron' | 'openclaw' | 'n8n' | 'hook'
type TaskHost = 'mac-mini' | 'gcp-vm'

interface TaskDef {
  name: string
  description: string
  frequency: string
  group: string
  type: TaskType
  host: TaskHost
}

// ── Task definitions ─────────────────────────────────────────────────────────
// type: how it runs (openclaw cron / n8n flow / launchd / Claude scheduled-task / hook)
// host: where it runs (gcp-vm = openclaw-vm, mac-mini = local desktop)

const TASKS: TaskDef[] = [
  // Dev & Business (existing Claude scheduled-tasks)
  { name: 'nella-daily-dev-log', description: 'Daily dev log from repo activity', frequency: 'Daily', group: 'Dev & Business', type: 'claude', host: 'mac-mini' },
  { name: 'daily-repo-inspection', description: 'Website repo state summary', frequency: 'Daily 3am', group: 'Dev & Business', type: 'claude', host: 'mac-mini' },
  { name: 'daily-repo-summary', description: 'Core repo state summary', frequency: 'Daily 3am', group: 'Dev & Business', type: 'claude', host: 'mac-mini' },
  { name: 'medellin-lead-gen', description: 'Freelance lead generation for Medellin area', frequency: 'Bimonthly', group: 'Dev & Business', type: 'claude', host: 'mac-mini' },
  { name: 'weekly-competition-scanner', description: 'Scan for competitions, grants, hackathons', frequency: 'Weekly', group: 'Dev & Business', type: 'claude', host: 'mac-mini' },

  // Intelligence
  { name: 'ai-intelligence-brief', description: 'AI developments & intelligence brief', frequency: 'Periodic', group: 'Intelligence', type: 'claude', host: 'mac-mini' },
  { name: 'weekly-reading-digest', description: 'Reading materials digest from Notes & files', frequency: 'Weekly', group: 'Intelligence', type: 'claude', host: 'mac-mini' },

  // Discovery (Nella ICP listeners + scoring)
  { name: 'x-discovery', description: 'Bird CLI search of X for trigger phrases, upserts leads to Supabase', frequency: 'Every 20 min', group: 'Discovery', type: 'openclaw', host: 'gcp-vm' },
  { name: 'mutuals-refresh', description: 'Refresh X mutuals list to filter discovery against existing follows', frequency: 'Weekly Sun 6am', group: 'Discovery', type: 'openclaw', host: 'gcp-vm' },
  { name: 'classifier-stage1', description: 'Nano LLM scores new leads into ICP slots (n8n flow)', frequency: 'Every 5 min', group: 'Discovery', type: 'n8n', host: 'gcp-vm' },
  { name: 'velocity-alerts', description: 'Detects 5x baseline spikes per keyword in 30-min windows (n8n)', frequency: 'Every 30 min', group: 'Discovery', type: 'n8n', host: 'gcp-vm' },

  // Content & Knowledge
  { name: 'content-draft-queue', description: 'Drafts 3-5 X posts daily in voice via voice-post + RAG over Mars', frequency: 'Daily 9am', group: 'Content & Knowledge', type: 'launchd', host: 'mac-mini' },
  { name: 'build-in-public-log', description: 'Drafts 1-2 sentence build-log post from git/Vercel activity', frequency: 'Daily 6pm', group: 'Content & Knowledge', type: 'launchd', host: 'mac-mini' },
  { name: 'thread-builder', description: 'Voice memo in Mars/transcripts/incoming/ produces 4-8 post X thread draft', frequency: 'On file land', group: 'Content & Knowledge', type: 'launchd', host: 'mac-mini' },
  { name: 'mars-rag-index', description: 'FAISS index over Mars + Cortex + journal; powers /recall Telegram cmd', frequency: 'Daily 3am', group: 'Content & Knowledge', type: 'launchd', host: 'mac-mini' },
  { name: 'course-companion', description: 'PDF in Mars/courses/incoming/ produces classify + flashcards', frequency: 'On file land', group: 'Content & Knowledge', type: 'launchd', host: 'mac-mini' },

  // Discipline & Content (existing)
  { name: 'discipline-enforcer', description: 'Daily discipline summary: commits, content, outbound', frequency: 'Daily 9pm', group: 'Discipline & Content', type: 'claude', host: 'mac-mini' },

  // Ops & Life
  { name: 'uptime-flap-filter', description: 'Reads Uptime Kuma; pages Pushover only after 3 consecutive down checks + restart attempt', frequency: 'Every 5 min', group: 'Ops & Life', type: 'launchd', host: 'mac-mini' },
  { name: 'adc-health', description: 'Mints a token from openclaw-vm ADC; flags invalid_rapt to Pushover + Slack + Cortex', frequency: 'Every 5 min', group: 'Ops & Life', type: 'launchd', host: 'mac-mini' },
  { name: 'oracle-gmail-poll', description: 'Oracle reads Gmail, classifies via Vertex Gemini, posts Slack digest as @oracle, fires Pushover for urgent items', frequency: 'Every 30 min', group: 'Ops & Life', type: 'cron', host: 'gcp-vm' },
  { name: 'health-habit-tracker', description: 'PPL/swim/sleep/cal/journal Telegram check-in; Sun graph', frequency: 'Daily 9pm + Sun 8pm', group: 'Ops & Life', type: 'launchd', host: 'mac-mini' },

  // Security & Discipline
  { name: 'cost-guardian', description: 'Sums LLM/cloud bills daily; Pushover at 50/80/100% thresholds (n8n)', frequency: 'Daily 8am', group: 'Security & Discipline', type: 'n8n', host: 'gcp-vm' },
  { name: 'distraction-logger', description: 'Telegram /dw start <task>; mid-session pings; end-of-session honesty audit (n8n)', frequency: 'On /dw command', group: 'Security & Discipline', type: 'n8n', host: 'gcp-vm' },

  // System (existing launchd daemons, kept per user)
  { name: 'daily-file-watchdog', description: 'Workspace cleanup: Downloads, Desktop, Movies', frequency: 'Daily', group: 'System', type: 'claude', host: 'mac-mini' },
  { name: 'backup-projects', description: 'Hourly OneDrive backup with smart pruning', frequency: 'Hourly', group: 'System', type: 'launchd', host: 'mac-mini' },
  { name: 'infra-health', description: 'Health check for localhost-mirror, content-pipeline, cortex', frequency: 'Every 2 min', group: 'System', type: 'launchd', host: 'mac-mini' },
  { name: 'content-pipeline', description: 'Content Pipeline app daemon (keep-alive)', frequency: 'Always', group: 'System', type: 'launchd', host: 'mac-mini' },
  { name: 'localhost-mirror', description: 'Tunnel daemon for LAN/Tailscale access', frequency: 'Always', group: 'System', type: 'launchd', host: 'mac-mini' },
]

// Visual config per task TYPE (where the work runs).
const typeConfig: Record<TaskType, { label: string; bg: string; color: string }> = {
  openclaw: { label: 'openclaw', bg: 'bg-pink-500/15', color: 'text-pink-400' },
  n8n:      { label: 'n8n',      bg: 'bg-rose-500/15', color: 'text-rose-300' },
  launchd:  { label: 'launchd',  bg: 'bg-green-500/15', color: 'text-green-400' },
  claude:   { label: 'claude',   bg: 'bg-purple-500/15', color: 'text-purple-400' },
  hook:     { label: 'hook',     bg: 'bg-cyan-500/15', color: 'text-cyan-400' },
  cron:     { label: 'cron',     bg: 'bg-yellow-500/15', color: 'text-yellow-400' },
}

// Visual config per HOST (where the runtime lives).
const hostConfig: Record<TaskHost, { label: string; bg: string; color: string }> = {
  'gcp-vm':   { label: 'GCP VM',   bg: 'bg-blue-500/10',  color: 'text-blue-300' },
  'mac-mini': { label: 'Mac mini', bg: 'bg-slate-500/15', color: 'text-slate-300' },
}

const groupConfig: Record<string, { icon: typeof Code; color: string }> = {
  'Foundation': { icon: Brain, color: 'text-cyan-400' },
  'Dev & Business': { icon: Code, color: 'text-blue-400' },
  'Intelligence': { icon: Brain, color: 'text-purple-400' },
  'Discovery': { icon: Search, color: 'text-pink-400' },
  'Content & Knowledge': { icon: FileText, color: 'text-amber-400' },
  'Discipline & Content': { icon: Flame, color: 'text-orange-400' },
  'Ops & Life': { icon: Clock, color: 'text-emerald-400' },
  'Security & Discipline': { icon: AlertTriangle, color: 'text-red-400' },
  'System': { icon: Server, color: 'text-green-400' },
}

const statusStyle: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  success: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Success' },
  error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Error' },
  'pending-approval': { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Pending Approval' },
}

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Markdown prose styling ───────────────────────────────────────────────────

const mdComponents = {
  h1: (props: any) => <h1 className="text-lg font-bold mt-4 mb-2" {...props} />,
  h2: (props: any) => <h2 className="text-base font-semibold mt-4 mb-2 text-foreground" {...props} />,
  h3: (props: any) => <h3 className="text-sm font-semibold mt-3 mb-1.5 text-foreground" {...props} />,
  p: (props: any) => <p className="text-sm text-muted-foreground leading-relaxed mb-2" {...props} />,
  ul: (props: any) => <ul className="text-sm text-muted-foreground space-y-1 mb-3 ml-4 list-disc" {...props} />,
  ol: (props: any) => <ol className="text-sm text-muted-foreground space-y-1 mb-3 ml-4 list-decimal" {...props} />,
  li: (props: any) => <li className="leading-relaxed" {...props} />,
  strong: (props: any) => <strong className="text-foreground font-semibold" {...props} />,
  em: (props: any) => <em className="text-foreground/80" {...props} />,
  code: (props: any) => <code className="text-[11px] bg-secondary/80 px-1.5 py-0.5 rounded font-mono text-foreground" {...props} />,
  pre: (props: any) => <pre className="text-[11px] bg-secondary/50 rounded-lg p-3 overflow-x-auto my-2 font-mono" {...props} />,
  hr: () => <hr className="border-border/30 my-4" />,
  a: (props: any) => <a className="text-blue-400 underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...props} />,
  blockquote: (props: any) => <blockquote className="border-l-2 border-border/50 pl-3 text-sm text-muted-foreground italic my-2" {...props} />,
  table: (props: any) => <div className="overflow-x-auto my-2"><table className="text-xs w-full" {...props} /></div>,
  th: (props: any) => <th className="text-left font-medium text-muted-foreground px-2 py-1.5 border-b border-border/30" {...props} />,
  td: (props: any) => <td className="text-muted-foreground px-2 py-1.5 border-b border-border/20" {...props} />,
}

// ── Component ────────────────────────────────────────────────────────────────

export function AutomationsPage() {
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<AutomationRun | null>(null)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)

  const fetchRuns = async () => {
    setLoading(true)
    try {
      let data: { runs: AutomationRun[] } | null = null
      try {
        const res = await fetch('/api/data?key=cortex-automations')
        if (res.ok) data = await res.json()
      } catch { /* try IPC */ }
      if (!data && window.electronAPI?.data) {
        data = await window.electronAPI.data.read('cortex-automations') as any
      }
      setRuns(data?.runs || [])
    } catch { /* empty */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchRuns() }, [])

  const handleAction = async (runId: string, action: 'approve' | 'reject') => {
    try {
      await fetch(`/api/automation/${runId}/${action}`, { method: 'POST' })
      fetchRuns()
      setSelectedRun(null)
    } catch { /* silent */ }
  }

  const taskLastRun = useMemo(() => {
    const map: Record<string, AutomationRun> = {}
    for (const run of runs) {
      if (!map[run.taskName]) map[run.taskName] = run
    }
    return map
  }, [runs])

  const taskRuns = useMemo(() => {
    if (!selectedTask) return []
    return runs.filter((r) => r.taskName === selectedTask)
  }, [runs, selectedTask])

  const pendingApprovals = runs.filter((r) => r.status === 'pending-approval')
  const recentRuns = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return runs.filter((r) => new Date(r.timestamp).getTime() > cutoff)
  }, [runs])
  const groups = ['Foundation', 'Dev & Business', 'Intelligence', 'Discovery', 'Content & Knowledge', 'Discipline & Content', 'Ops & Life', 'Security & Discipline', 'System']

  const filteredTasks = useMemo(() => {
    const lowerSearch = search.toLowerCase()
    return TASKS.filter((t) =>
      (!groupFilter || t.group === groupFilter) &&
      (!search || t.name.toLowerCase().includes(lowerSearch) || t.description.toLowerCase().includes(lowerSearch))
    )
  }, [search, groupFilter])

  // ── Detail view: reading a specific run ─────────────────────────
  if (selectedRun) {
    const task = TASKS.find((t) => t.name === selectedRun.taskName)
    const st = statusStyle[selectedRun.status] || statusStyle.success
    const StatusIcon = st.icon

    return (
      <PageShell>
        <button onClick={() => setSelectedRun(null)} className="cursor-pointer flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /> Back to tasks
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold break-words">{selectedRun.taskName}</h2>
            {task && <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{task.description}</p>}
            <div className="flex items-center gap-2 sm:gap-3 mt-2 flex-wrap">
              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${st.bg} ${st.color}`}>
                <StatusIcon className="h-3 w-3" /> {st.label}
              </span>
              <span className="text-xs text-muted-foreground">{fmtDate(selectedRun.timestamp)}</span>
              <span className="text-xs text-muted-foreground/50">{timeAgo(selectedRun.timestamp)}</span>
            </div>
          </div>
          {selectedRun.status === 'pending-approval' && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => handleAction(selectedRun.id, 'approve')}
                className="cursor-pointer flex items-center gap-1.5 text-xs sm:text-sm text-green-400 bg-green-400/10 px-3 sm:px-4 py-2 rounded-lg hover:bg-green-400/20 transition-colors font-medium">
                <CheckCircle2 className="h-4 w-4" /> Approve
              </button>
              <button onClick={() => handleAction(selectedRun.id, 'reject')}
                className="cursor-pointer flex items-center gap-1.5 text-xs sm:text-sm text-red-400 bg-red-400/10 px-3 sm:px-4 py-2 rounded-lg hover:bg-red-400/20 transition-colors font-medium">
                <XCircle className="h-4 w-4" /> Reject
              </button>
            </div>
          )}
        </div>

        {selectedRun.summary && (
          <div className="rounded-xl border border-border bg-secondary/20 px-5 py-4">
            <p className="text-sm font-medium">{selectedRun.summary}</p>
          </div>
        )}

        {/* Full report rendered as markdown */}
        {selectedRun.fullOutput && (
          <div className="rounded-xl border border-border bg-card px-3 py-4 sm:px-5 sm:py-5 md:px-8 md:py-6 overflow-x-auto">
            <Markdown components={mdComponents}>{selectedRun.fullOutput}</Markdown>
          </div>
        )}
      </PageShell>
    )
  }

  // ── Task history view: all runs for a specific task ─────────────
  if (selectedTask) {
    const task = TASKS.find((t) => t.name === selectedTask)

    return (
      <PageShell>
        <button onClick={() => setSelectedTask(null)} className="cursor-pointer flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /> Back to tasks
        </button>

        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold break-words">{selectedTask}</h2>
          {task && <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{task.description} · {task.frequency}</p>}
        </div>

        <div className="flex flex-col gap-3">
          {taskRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No runs recorded yet for this task.</p>
          ) : taskRuns.map((run) => {
            const st = statusStyle[run.status] || statusStyle.success
            const StatusIcon = st.icon
            return (
              <button key={run.id} onClick={() => setSelectedRun(run)}
                className="cursor-pointer w-full text-left rounded-xl border border-border bg-card hover:bg-secondary/20 transition-colors px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${st.color}`} />
                      <span className="text-xs font-medium">{fmtDate(run.timestamp)}</span>
                      <span className="text-[10px] text-muted-foreground/50">{timeAgo(run.timestamp)}</span>
                    </div>
                    {run.summary && <p className="text-sm text-muted-foreground">{run.summary}</p>}
                    {run.fullOutput && (
                      <p className="text-xs text-muted-foreground/40 mt-1 line-clamp-2">{run.fullOutput.slice(0, 200)}</p>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/20 shrink-0 mt-1" />
                </div>
              </button>
            )
          })}
        </div>
      </PageShell>
    )
  }

  // ── Main dashboard view ────────────────────────────────────────
  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {TASKS.length} tasks · {runs.length} runs
          {pendingApprovals.length > 0 && ` · ${pendingApprovals.length} pending`}
        </p>
        <Button variant="secondary" size="sm" onClick={fetchRuns} disabled={loading}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Pending approvals — prominent */}
      {pendingApprovals.length > 0 && (
        <WidgetCard title="NEEDS YOUR ATTENTION" description={`${pendingApprovals.length} pending`} variant="urgent" delay={0}>
          <div className="flex flex-col gap-2">
            {pendingApprovals.map((run) => (
              <button key={run.id} onClick={() => setSelectedRun(run)}
                className="cursor-pointer w-full text-left rounded-lg border border-yellow-500/30 bg-yellow-500/[0.03] px-4 py-3 hover:bg-yellow-500/[0.06] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                      <span className="text-sm font-semibold">{run.taskName}</span>
                      <span className="text-[10px] text-muted-foreground">{timeAgo(run.timestamp)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{run.summary}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-yellow-400/40 shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        </WidgetCard>
      )}

      {/* Recent jobs — last 24h */}
      {recentRuns.length > 0 && (
        <WidgetCard title="RECENT JOBS" description={`${recentRuns.length} in the last 24h`} delay={0.05}>
          <div className="flex flex-col gap-1">
            {recentRuns.map((run) => {
              const st = statusStyle[run.status] || statusStyle.success
              const StatusIcon = st.icon
              return (
                <button key={run.id} onClick={() => setSelectedRun(run)}
                  className="cursor-pointer w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-secondary/30 transition-colors group">
                  <StatusIcon className={`h-4 w-4 shrink-0 ${st.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{run.taskName}</span>
                      <span className={`text-[8px] px-1 py-0.5 rounded ${st.bg} ${st.color}`}>{st.label}</span>
                    </div>
                    {run.summary && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{run.summary}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 shrink-0">{timeAgo(run.timestamp)}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors shrink-0" />
                </button>
              )
            })}
          </div>
        </WidgetCard>
      )}

      {/* Search + Group filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..."
            className="h-8 w-full rounded-lg border border-border bg-input pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="flex gap-1.5 flex-wrap overflow-x-auto">
          {groups.map((g) => {
            const cfg = groupConfig[g]
            return (
              <button key={g} onClick={() => setGroupFilter(groupFilter === g ? null : g)}
                className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                  groupFilter === g ? `${cfg.color} bg-current/10 border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'
                }`}>
                {g}
              </button>
            )
          })}
        </div>
      </div>

      {/* Task groups */}
      {groups.filter((g) => !groupFilter || groupFilter === g).map((group) => {
        const cfg = groupConfig[group]
        const GroupIcon = cfg.icon
        const tasksInGroup = filteredTasks.filter((t) => t.group === group)
        if (tasksInGroup.length === 0) return null

        return (
          <div key={group}>
            <div className="flex items-center gap-2 mb-3">
              <GroupIcon className={`h-4 w-4 ${cfg.color}`} />
              <h2 className="text-sm font-semibold">{group}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tasksInGroup.map((task) => {
                const lastRun = taskLastRun[task.name]
                const st = lastRun ? statusStyle[lastRun.status] : null
                const StatusIcon = st?.icon || Clock

                return (
                  <div key={task.name} className="rounded-xl border border-border bg-card hover:bg-secondary/20 transition-colors">
                    {/* Card header */}
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold break-all">{task.name}</span>
                            {(() => {
                              const tc = typeConfig[task.type]
                              const hc = hostConfig[task.host]
                              return (
                                <>
                                  <span className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${tc.bg} ${tc.color}`}>{tc.label}</span>
                                  <span className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${hc.bg} ${hc.color}`}>{hc.label}</span>
                                </>
                              )
                            })()}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{task.description}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Clock className="h-3 w-3 text-muted-foreground/40" />
                            <span className="text-[9px] text-muted-foreground/60">{task.frequency}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {lastRun ? (
                            <StatusIcon className={`h-3.5 w-3.5 ${st?.color || 'text-muted-foreground'}`} />
                          ) : (
                            <span className="text-[9px] text-muted-foreground/30">—</span>
                          )}
                        </div>
                      </div>

                      {/* Last run preview */}
                      {lastRun && (
                        <div className="mt-3 pt-2 border-t border-border/30">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] text-muted-foreground/50">{timeAgo(lastRun.timestamp)}</span>
                          </div>
                          {lastRun.summary && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2">{lastRun.summary}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex border-t border-border/30">
                      {lastRun && (
                        <button onClick={() => setSelectedRun(lastRun)}
                          className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground py-2 transition-colors hover:bg-secondary/30">
                          <FileText className="h-3 w-3" /> Read report
                        </button>
                      )}
                      <button onClick={() => setSelectedTask(task.name)}
                        className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground py-2 transition-colors hover:bg-secondary/30 border-l border-border/30">
                        <Clock className="h-3 w-3" /> History
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </PageShell>
  )
}
