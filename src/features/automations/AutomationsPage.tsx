import { useState, useEffect, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Button } from '@/components/ui/button'
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Server,
  Code,
  Brain,
  Flame,
  Search,
  FileText,
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

interface TaskDef {
  name: string
  description: string
  frequency: string
  group: string
  type: 'claude' | 'launchd' | 'cron'
}

// ── Task definitions ─────────────────────────────────────────────────────────

const TASKS: TaskDef[] = [
  // Dev & Business
  { name: 'daily-dev-log', description: 'Daily dev log from the product repo activity', frequency: 'Daily', group: 'Dev & Business', type: 'claude' },
  { name: 'daily-repo-inspection', description: 'the product Website repo state summary', frequency: 'Daily 3am', group: 'Dev & Business', type: 'claude' },
  { name: 'daily-repo-summary', description: 'the product core repo state summary', frequency: 'Daily 3am', group: 'Dev & Business', type: 'claude' },
  { name: 'medellin-lead-gen', description: 'Freelance lead generation for Medellin area', frequency: 'Bimonthly', group: 'Dev & Business', type: 'claude' },
  { name: 'weekly-competition-scanner', description: 'Scan for competitions, grants, hackathons', frequency: 'Weekly', group: 'Dev & Business', type: 'claude' },
  // Intelligence
  { name: 'ai-intelligence-brief', description: 'AI developments & intelligence brief', frequency: 'Periodic', group: 'Intelligence', type: 'claude' },
  { name: 'weekly-reading-digest', description: 'Reading materials digest from Notes & files', frequency: 'Weekly', group: 'Intelligence', type: 'claude' },
  // Discipline & Content
  { name: 'discipline-enforcer', description: 'Daily discipline summary — commits, content, outbound', frequency: 'Daily 9pm', group: 'Discipline & Content', type: 'claude' },
  { name: 'discipline-check', description: 'Hourly commit & content check during work hours', frequency: 'Hourly 9am-10pm', group: 'Discipline & Content', type: 'cron' },
  { name: 'social-pulse', description: 'Social media engagement metrics & inbound signals', frequency: 'Periodic', group: 'Discipline & Content', type: 'claude' },
  // System
  { name: 'daily-file-watchdog', description: 'Workspace cleanup — Downloads, Desktop, Movies', frequency: 'Daily', group: 'System', type: 'claude' },
  { name: 'backup-projects', description: 'Hourly OneDrive backup with smart pruning', frequency: 'Hourly', group: 'System', type: 'launchd' },
  { name: 'infra-health', description: 'Health check for localhost-mirror, content-pipeline, cortex', frequency: 'Every 2 min', group: 'System', type: 'launchd' },
  { name: 'content-pipeline', description: 'Content Pipeline app daemon (keep-alive)', frequency: 'Always', group: 'System', type: 'launchd' },
  { name: 'localhost-mirror', description: 'Tunnel daemon for LAN/Tailscale access', frequency: 'Always', group: 'System', type: 'launchd' },
]

const groupConfig: Record<string, { icon: typeof Code; color: string }> = {
  'Dev & Business': { icon: Code, color: 'text-blue-400' },
  'Intelligence': { icon: Brain, color: 'text-purple-400' },
  'Discipline & Content': { icon: Flame, color: 'text-orange-400' },
  'System': { icon: Server, color: 'text-green-400' },
}

const statusIcon: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  success: { icon: CheckCircle2, color: 'text-green-400' },
  error: { icon: XCircle, color: 'text-red-400' },
  'pending-approval': { icon: AlertTriangle, color: 'text-yellow-400' },
}

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Component ────────────────────────────────────────────────────────────────

export function AutomationsPage() {
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string | null>(null)

  const fetchRuns = async () => {
    setLoading(true)
    try {
      // Try API first (works from browser/iPhone), then Electron IPC
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

  const handleApprove = async (runId: string, action: 'approve' | 'reject') => {
    try {
      await fetch(`/api/automation/${runId}/${action}`, { method: 'POST' })
      fetchRuns()
    } catch { /* retry from electron */ }
  }

  const toggleExpand = (id: string) => setExpanded(expanded === id ? null : id)

  // Map runs to tasks
  const taskLastRun = useMemo(() => {
    const map: Record<string, AutomationRun> = {}
    for (const run of runs) {
      if (!map[run.taskName]) map[run.taskName] = run
    }
    return map
  }, [runs])

  const pendingApprovals = runs.filter((r) => r.status === 'pending-approval')
  const groups = ['Dev & Business', 'Intelligence', 'Discipline & Content', 'System']

  const filteredTasks = useMemo(() => {
    const lowerSearch = search.toLowerCase()
    return TASKS.filter((t) =>
      (!groupFilter || t.group === groupFilter) &&
      (!search || t.name.toLowerCase().includes(lowerSearch) || t.description.toLowerCase().includes(lowerSearch))
    )
  }, [search, groupFilter])

  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {TASKS.length} tasks · {runs.length} runs logged
          {pendingApprovals.length > 0 && ` · ${pendingApprovals.length} pending approval`}
        </p>
        <Button variant="secondary" size="sm" onClick={fetchRuns} disabled={loading}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Pending approvals */}
      {pendingApprovals.length > 0 && (
        <WidgetCard title="PENDING APPROVAL" description={`${pendingApprovals.length} tasks need your review`} variant="urgent" delay={0}>
          <div className="flex flex-col gap-2">
            {pendingApprovals.map((run) => (
              <div key={run.id} className="rounded-lg border border-yellow-500/30 bg-yellow-500/[0.03] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                      <span className="text-sm font-semibold">{run.taskName}</span>
                      <span className="text-[10px] text-muted-foreground">{timeAgo(run.timestamp)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{run.summary}</p>
                    {run.fullOutput && (
                      <button onClick={() => toggleExpand(run.id)} className="cursor-pointer text-[10px] text-muted-foreground/50 hover:text-foreground mt-1 flex items-center gap-1">
                        {expanded === run.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {expanded === run.id ? 'Hide details' : 'Show details'}
                      </button>
                    )}
                    {expanded === run.id && run.fullOutput && (
                      <pre className="mt-2 text-[10px] text-muted-foreground bg-secondary/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">{run.fullOutput}</pre>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleApprove(run.id, 'approve')}
                      className="cursor-pointer flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-3 py-1.5 rounded-lg hover:bg-green-400/20 transition-colors">
                      <CheckCircle2 className="h-3 w-3" /> Approve
                    </button>
                    <button onClick={() => handleApprove(run.id, 'reject')}
                      className="cursor-pointer flex items-center gap-1 text-xs text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg hover:bg-red-400/20 transition-colors">
                      <XCircle className="h-3 w-3" /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </WidgetCard>
      )}

      {/* Search + Group filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..."
            className="h-8 w-full rounded-lg border border-border bg-input pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
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
              <span className="text-[10px] text-muted-foreground">{tasksInGroup.length} tasks</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tasksInGroup.map((task) => {
                const lastRun = taskLastRun[task.name]
                const si = lastRun ? statusIcon[lastRun.status] : null
                const StatusIcon = si?.icon || Clock
                const isExpanded = expanded === task.name

                return (
                  <div key={task.name} className="rounded-xl border border-border bg-card hover:bg-secondary/20 transition-colors">
                    <button onClick={() => toggleExpand(task.name)} className="cursor-pointer w-full text-left px-4 py-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold truncate">{task.name}</span>
                            <span className={`text-[8px] px-1 py-0.5 rounded ${
                              task.type === 'claude' ? 'bg-purple-500/15 text-purple-400'
                              : task.type === 'launchd' ? 'bg-green-500/15 text-green-400'
                              : 'bg-yellow-500/15 text-yellow-400'
                            }`}>{task.type}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{task.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="h-3 w-3 text-muted-foreground/40" />
                            <span className="text-[9px] text-muted-foreground/60">{task.frequency}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {lastRun ? (
                            <>
                              <StatusIcon className={`h-3.5 w-3.5 ${si?.color || 'text-muted-foreground'}`} />
                              <span className="text-[9px] text-muted-foreground">{timeAgo(lastRun.timestamp)}</span>
                            </>
                          ) : (
                            <span className="text-[9px] text-muted-foreground/30">No runs</span>
                          )}
                          {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground/30" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/30" />}
                        </div>
                      </div>
                    </button>

                    {isExpanded && lastRun && (
                      <div className="px-4 pb-3 border-t border-border/30 pt-2">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-3 w-3 text-muted-foreground/50" />
                          <span className="text-[9px] text-muted-foreground">Latest output</span>
                          <span className="text-[9px] text-muted-foreground/40 ml-auto">{new Date(lastRun.timestamp).toLocaleString()}</span>
                        </div>
                        {lastRun.summary && (
                          <p className="text-[11px] text-muted-foreground mb-2">{lastRun.summary}</p>
                        )}
                        {lastRun.fullOutput && (
                          <pre className="text-[9px] text-muted-foreground/60 bg-secondary/50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-[200px] overflow-y-auto">{lastRun.fullOutput}</pre>
                        )}
                        {lastRun.status === 'pending-approval' && (
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => handleApprove(lastRun.id, 'approve')}
                              className="cursor-pointer flex items-center gap-1 text-[10px] text-green-400 bg-green-400/10 px-2 py-1 rounded hover:bg-green-400/20">
                              <CheckCircle2 className="h-3 w-3" /> Approve
                            </button>
                            <button onClick={() => handleApprove(lastRun.id, 'reject')}
                              className="cursor-pointer flex items-center gap-1 text-[10px] text-red-400 bg-red-400/10 px-2 py-1 rounded hover:bg-red-400/20">
                              <XCircle className="h-3 w-3" /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Recent runs log */}
      {runs.length > 0 && (
        <WidgetCard title="RECENT RUNS" description={`Last ${Math.min(runs.length, 20)} runs`} delay={0.1}>
          <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
            {runs.slice(0, 20).map((run) => {
              const si = statusIcon[run.status]
              const StatusIcon = si?.icon || Clock
              return (
                <div key={run.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-secondary/30 transition-colors">
                  <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${si?.color || 'text-muted-foreground'}`} />
                  <span className="text-xs font-medium truncate flex-1">{run.taskName}</span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{run.summary}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0">{timeAgo(run.timestamp)}</span>
                </div>
              )
            })}
          </div>
        </WidgetCard>
      )}
    </PageShell>
  )
}
