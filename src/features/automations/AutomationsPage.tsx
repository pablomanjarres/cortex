import { useState, useEffect, useMemo } from 'react'
import Markdown from 'react-markdown'
import { PageShell } from '@/components/shared/PageShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/shared/Skeleton'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
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

type TaskType = 'claude' | 'launchd' | 'cron' | 'n8n' | 'hook'
type TaskHost = 'mac-mini'

interface TaskDef {
  name: string
  description: string
  frequency: string
  group: string
  type: TaskType
  host: TaskHost
}

// ── Task definitions ─────────────────────────────────────────────────────────
// type: how it runs (n8n flow / launchd / cron / Claude scheduled-task / hook)
// host: where it runs (mac-mini = local desktop)

// Non-Claude automations are curated here — launchd/cron jobs are local
// daemons and aren't discoverable from disk. Claude scheduled-tasks are
// merged in LIVE from ~/.claude/scheduled-tasks/ (see CLAUDE_TASK_META +
// the fetch in the component), so they self-sync.
const STATIC_TASKS: TaskDef[] = [
  // Content & Knowledge
  { name: 'content-draft-queue', description: 'Drafts 3-5 X posts daily in voice via voice-post + RAG over Mars', frequency: 'Daily 9am', group: 'Content & Knowledge', type: 'launchd', host: 'mac-mini' },
  { name: 'build-in-public-log', description: 'Drafts 1-2 sentence build-log post from git/Vercel activity', frequency: 'Daily 6pm', group: 'Content & Knowledge', type: 'launchd', host: 'mac-mini' },
  { name: 'thread-builder', description: 'Voice memo in Mars/transcripts/incoming/ produces 4-8 post X thread draft', frequency: 'On file land', group: 'Content & Knowledge', type: 'launchd', host: 'mac-mini' },
  { name: 'mars-rag-index', description: 'FAISS index over Mars + Cortex + journal; powers /recall Telegram cmd', frequency: 'Daily 3am', group: 'Content & Knowledge', type: 'launchd', host: 'mac-mini' },
  { name: 'course-companion', description: 'PDF in Mars/courses/incoming/ produces classify + flashcards', frequency: 'On file land', group: 'Content & Knowledge', type: 'launchd', host: 'mac-mini' },

  // Ops & Life
  { name: 'health-habit-tracker', description: 'PPL/swim/sleep/cal/journal Telegram check-in; Sun graph', frequency: 'Daily 9pm + Sun 8pm', group: 'Ops & Life', type: 'launchd', host: 'mac-mini' },

  // System (launchd daemons)
  { name: 'backup-projects', description: 'Hourly OneDrive backup with smart pruning', frequency: 'Hourly', group: 'System', type: 'launchd', host: 'mac-mini' },
  { name: 'infra-health', description: 'Health check for localhost-mirror and cortex', frequency: 'Every 2 min', group: 'System', type: 'launchd', host: 'mac-mini' },
  { name: 'localhost-mirror', description: 'Tunnel daemon for LAN/Tailscale access', frequency: 'Always', group: 'System', type: 'launchd', host: 'mac-mini' },
]

// Curated group + frequency for known Claude scheduled-tasks. Existence and
// description come LIVE from ~/.claude/scheduled-tasks/; this only enriches
// the display (the disk frontmatter has no structured schedule/group). Any
// task not listed here falls back to DEFAULT_CLAUDE_META, so brand-new
// scheduled-tasks still show up — just in the default bucket until curated.
const CLAUDE_TASK_META: Record<string, { group: string; frequency: string }> = {
  'nella-daily-dev-log':        { group: 'Dev & Business', frequency: 'Daily' },
  'daily-repo-inspection':      { group: 'Dev & Business', frequency: 'Daily 3am' },
  'daily-repo-summary':         { group: 'Dev & Business', frequency: 'Daily 3am' },
  'weekly-competition-scanner': { group: 'Dev & Business', frequency: 'Mon & Thu' },
  'startup-events-radar':       { group: 'Dev & Business', frequency: '1st & 15th' },
  'ai-intelligence-brief':      { group: 'Intelligence', frequency: 'Periodic' },
  'weekly-reading-digest':      { group: 'Intelligence', frequency: 'Weekly' },
  'discipline-enforcer':        { group: 'Discipline & Content', frequency: 'Daily 9pm' },
  'daily-file-watchdog':        { group: 'System', frequency: 'Daily' },
}
const DEFAULT_CLAUDE_META = { group: 'Dev & Business', frequency: 'Scheduled' }

// Task TYPE / HOST are categories, not statuses — rendered as neutral Chips.
const typeLabel: Record<TaskType, string> = {
  n8n: 'n8n',
  launchd: 'launchd',
  claude: 'claude',
  hook: 'hook',
  cron: 'cron',
}

const hostLabel: Record<TaskHost, string> = {
  'mac-mini': 'Mac mini',
}

const groupIcon: Record<string, typeof Code> = {
  'Foundation': Brain,
  'Dev & Business': Code,
  'Intelligence': Brain,
  'Content & Knowledge': FileText,
  'Discipline & Content': Flame,
  'Ops & Life': Clock,
  'System': Server,
}

// Run status is a STATUS — semantic tokens only.
const statusMeta: Record<string, { icon: typeof CheckCircle2; chip: 'success' | 'danger' | 'warning'; text: string; label: string }> = {
  success: { icon: CheckCircle2, chip: 'success', text: 'text-success', label: 'Success' },
  error: { icon: XCircle, chip: 'danger', text: 'text-destructive', label: 'Error' },
  'pending-approval': { icon: AlertTriangle, chip: 'warning', text: 'text-warning', label: 'Pending approval' },
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
  h1: (props: any) => <h1 className="mt-4 mb-2 text-lg font-bold" {...props} />,
  h2: (props: any) => <h2 className="mt-4 mb-2 text-base font-semibold text-foreground" {...props} />,
  h3: (props: any) => <h3 className="mt-3 mb-1.5 text-sm font-semibold text-foreground" {...props} />,
  p: (props: any) => <p className="mb-2 text-sm leading-relaxed text-muted-foreground" {...props} />,
  ul: (props: any) => <ul className="mb-3 ml-4 list-disc space-y-1 text-sm text-muted-foreground" {...props} />,
  ol: (props: any) => <ol className="mb-3 ml-4 list-decimal space-y-1 text-sm text-muted-foreground" {...props} />,
  li: (props: any) => <li className="leading-relaxed" {...props} />,
  strong: (props: any) => <strong className="font-semibold text-foreground" {...props} />,
  em: (props: any) => <em className="text-muted-foreground" {...props} />,
  code: (props: any) => <code className="rounded-md bg-secondary/80 px-1.5 py-0.5 font-mono text-2xs text-foreground" {...props} />,
  pre: (props: any) => <pre className="my-2 overflow-x-auto rounded-md bg-secondary/50 p-3 font-mono text-2xs" {...props} />,
  hr: () => <hr className="my-4 border-border/60" />,
  a: (props: any) => <a className="text-accent underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...props} />,
  blockquote: (props: any) => <blockquote className="my-2 border-l-2 border-border pl-3 text-sm italic text-muted-foreground" {...props} />,
  table: (props: any) => <div className="my-2 overflow-x-auto"><table className="w-full text-xs" {...props} /></div>,
  th: (props: any) => <th className="border-b border-border/60 px-2 py-1.5 text-left font-medium text-muted-foreground" {...props} />,
  td: (props: any) => <td className="border-b border-border/40 px-2 py-1.5 text-muted-foreground" {...props} />,
}

// ── Component ────────────────────────────────────────────────────────────────

export function AutomationsPage() {
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<AutomationRun | null>(null)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [scheduledTasks, setScheduledTasks] = useState<{ name: string; description: string }[]>([])

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

  // Live-discover Claude scheduled-tasks from ~/.claude/scheduled-tasks/.
  const fetchScheduledTasks = async () => {
    try {
      let list: { name: string; description: string }[] | null = null
      try {
        const res = await fetch('/api/automation/scheduled-tasks')
        if (res.ok) list = await res.json()
      } catch { /* try IPC */ }
      if (!list && window.electronAPI?.automation) {
        list = await window.electronAPI.automation.scheduledTasks()
      }
      setScheduledTasks(list || [])
    } catch { /* empty */ }
  }

  const refreshAll = () => { fetchRuns(); fetchScheduledTasks() }

  useEffect(() => { refreshAll() }, [])

  // Claude tasks come live from disk; non-Claude tasks stay curated. Merge
  // both into the single list the dashboard renders from.
  const claudeTasks = useMemo<TaskDef[]>(() =>
    scheduledTasks.map((t) => {
      const meta = CLAUDE_TASK_META[t.name] || DEFAULT_CLAUDE_META
      return { name: t.name, description: t.description || t.name, frequency: meta.frequency, group: meta.group, type: 'claude', host: 'mac-mini' }
    }), [scheduledTasks])

  const allTasks = useMemo<TaskDef[]>(() => [...claudeTasks, ...STATIC_TASKS], [claudeTasks])

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
  const groups = ['Foundation', 'Dev & Business', 'Intelligence', 'Content & Knowledge', 'Discipline & Content', 'Ops & Life', 'System']

  const filteredTasks = useMemo(() => {
    const lowerSearch = search.toLowerCase()
    return allTasks.filter((t) =>
      (!groupFilter || t.group === groupFilter) &&
      (!search || t.name.toLowerCase().includes(lowerSearch) || t.description.toLowerCase().includes(lowerSearch))
    )
  }, [search, groupFilter, allTasks])

  // ── Detail view: reading a specific run ─────────────────────────
  if (selectedRun) {
    const task = allTasks.find((t) => t.name === selectedRun.taskName)
    const st = statusMeta[selectedRun.status] || statusMeta.success
    const StatusIcon = st.icon

    return (
      <PageShell>
        <div>
          <Button variant="ghost" size="sm" onClick={() => setSelectedRun(null)}>
            <ChevronLeft /> Back to tasks
          </Button>
        </div>

        <PageHeader
          kicker="Run report"
          title={selectedRun.taskName}
          subtitle={task?.description}
          actions={selectedRun.status === 'pending-approval' ? (
            <>
              <Button size="sm" onClick={() => handleAction(selectedRun.id, 'approve')}>
                <CheckCircle2 /> Approve
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handleAction(selectedRun.id, 'reject')}>
                <XCircle /> Reject
              </Button>
            </>
          ) : undefined}
        />

        <div className="-mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <Chip variant={st.chip} size="sm">
            <StatusIcon /> {st.label}
          </Chip>
          <span className="font-mono text-2xs text-muted-foreground">{fmtDate(selectedRun.timestamp)}</span>
          <span className="font-mono text-2xs text-foreground-faint">{timeAgo(selectedRun.timestamp)}</span>
        </div>

        {selectedRun.summary && (
          <div className="rounded-md border border-border/60 bg-secondary/20 px-4 py-3">
            <p className="text-sm font-medium">{selectedRun.summary}</p>
          </div>
        )}

        {/* Full report rendered as markdown */}
        {selectedRun.fullOutput && (
          <div className="surface overflow-x-auto rounded-xl px-3 py-4 sm:px-5 sm:py-5 md:px-8 md:py-6">
            <Markdown components={mdComponents}>{selectedRun.fullOutput}</Markdown>
          </div>
        )}
      </PageShell>
    )
  }

  // ── Task history view: all runs for a specific task ─────────────
  if (selectedTask) {
    const task = allTasks.find((t) => t.name === selectedTask)

    return (
      <PageShell>
        <div>
          <Button variant="ghost" size="sm" onClick={() => setSelectedTask(null)}>
            <ChevronLeft /> Back to tasks
          </Button>
        </div>

        <PageHeader
          kicker="Task history"
          title={selectedTask}
          subtitle={task ? `${task.description} · ${task.frequency}` : undefined}
        />

        <div className="flex flex-col gap-3">
          {taskRuns.length === 0 ? (
            <EmptyState message="No runs recorded yet for this task." />
          ) : taskRuns.map((run) => {
            const st = statusMeta[run.status] || statusMeta.success
            const StatusIcon = st.icon
            return (
              <button key={run.id} onClick={() => setSelectedRun(run)}
                className="surface w-full cursor-pointer rounded-xl px-4 py-3 text-left transition-colors hover:bg-secondary/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${st.text}`} />
                      <span className="font-mono text-xs font-medium">{fmtDate(run.timestamp)}</span>
                      <span className="font-mono text-2xs text-foreground-faint">{timeAgo(run.timestamp)}</span>
                    </div>
                    {run.summary && <p className="text-sm text-muted-foreground">{run.summary}</p>}
                    {run.fullOutput && (
                      <p className="mt-1 line-clamp-2 text-xs text-foreground-faint">{run.fullOutput.slice(0, 200)}</p>
                    )}
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-foreground-faint" />
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
        <p className="font-mono text-2xs tabular-nums text-muted-foreground">
          {allTasks.length} tasks · {runs.length} runs
          {pendingApprovals.length > 0 && (
            <span className="text-warning">{` · ${pendingApprovals.length} pending`}</span>
          )}
        </p>
        <Button variant="secondary" size="sm" onClick={refreshAll} disabled={loading}>
          <RefreshCw /> Refresh
        </Button>
      </div>

      {/* Initial load — skeleton in place of the runs widgets */}
      {loading && runs.length === 0 && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {/* Pending approvals — prominent */}
      {pendingApprovals.length > 0 && (
        <WidgetCard title="Needs your attention" description={`${pendingApprovals.length} pending`} variant="urgent" delay={0}>
          <div className="flex flex-col gap-2">
            {pendingApprovals.map((run) => (
              <button key={run.id} onClick={() => setSelectedRun(run)}
                className="w-full cursor-pointer rounded-md border border-warning/25 bg-warning/10 px-4 py-3 text-left transition-colors hover:bg-warning/15">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                      <span className="font-mono text-sm font-medium">{run.taskName}</span>
                      <span className="font-mono text-2xs text-foreground-faint">{timeAgo(run.timestamp)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{run.summary}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-warning" />
                </div>
              </button>
            ))}
          </div>
        </WidgetCard>
      )}

      {/* Recent jobs — last 24h */}
      {recentRuns.length > 0 && (
        <WidgetCard title="Recent jobs" description={`${recentRuns.length} in the last 24h`} delay={0.05}>
          <div className="flex flex-col gap-1">
            {recentRuns.map((run) => {
              const st = statusMeta[run.status] || statusMeta.success
              const StatusIcon = st.icon
              return (
                <button key={run.id} onClick={() => setSelectedRun(run)}
                  className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-secondary/30">
                  <StatusIcon className={`h-4 w-4 shrink-0 ${st.text}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{run.taskName}</span>
                      <Chip variant={st.chip} size="sm">{st.label}</Chip>
                    </div>
                    {run.summary && <p className="mt-0.5 truncate text-2xs text-muted-foreground">{run.summary}</p>}
                  </div>
                  <span className="shrink-0 font-mono text-2xs text-foreground-faint">{timeAgo(run.timestamp)}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )
            })}
          </div>
        </WidgetCard>
      )}

      {/* Search + Group filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs sm:flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..."
            className="h-8 pl-8 text-xs" />
        </div>
        <div className="flex flex-wrap gap-1.5 overflow-x-auto">
          {groups.map((g) => (
            <Chip key={g} selectable size="sm" selected={groupFilter === g}
              onClick={() => setGroupFilter(groupFilter === g ? null : g)}>
              {g}
            </Chip>
          ))}
        </div>
      </div>

      {/* Task groups */}
      {groups.filter((g) => !groupFilter || groupFilter === g).map((group) => {
        const GroupIcon = groupIcon[group]
        const tasksInGroup = filteredTasks.filter((t) => t.group === group)
        if (tasksInGroup.length === 0) return null

        return (
          <div key={group}>
            <div className="mb-3 flex items-center gap-2">
              <GroupIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">{group}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tasksInGroup.map((task) => {
                const lastRun = taskLastRun[task.name]
                const st = lastRun ? statusMeta[lastRun.status] : null
                const StatusIcon = st?.icon || Clock

                return (
                  <div key={task.name} className="surface rounded-xl transition-colors hover:bg-secondary/20">
                    {/* Card header */}
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="break-all font-mono text-xs font-medium">{task.name}</span>
                            <Chip size="sm">{typeLabel[task.type]}</Chip>
                            <Chip size="sm">{hostLabel[task.host]}</Chip>
                          </div>
                          <p className="mt-0.5 text-2xs text-muted-foreground">{task.description}</p>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-foreground-faint" />
                            <span className="font-mono text-2xs text-foreground-faint">{task.frequency}</span>
                          </div>
                        </div>
                        <div className="ml-2 flex items-center gap-1.5 shrink-0">
                          {lastRun ? (
                            <StatusIcon className={`h-3.5 w-3.5 ${st?.text || 'text-muted-foreground'}`} />
                          ) : (
                            <span className="font-mono text-2xs text-foreground-faint">—</span>
                          )}
                        </div>
                      </div>

                      {/* Last run preview */}
                      {lastRun && (
                        <div className="mt-3 border-t border-border/60 pt-2">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="font-mono text-3xs text-foreground-faint">{timeAgo(lastRun.timestamp)}</span>
                          </div>
                          {lastRun.summary && (
                            <p className="line-clamp-2 text-2xs text-muted-foreground">{lastRun.summary}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action footer — compact full-bleed segments (Button can't span card edges) */}
                    <div className="flex border-t border-border/60">
                      {lastRun && (
                        <button onClick={() => setSelectedRun(lastRun)}
                          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-2 font-mono text-2xs text-muted-foreground transition-colors hover:bg-secondary/30 hover:text-foreground">
                          <FileText className="h-3 w-3" /> Read report
                        </button>
                      )}
                      <button onClick={() => setSelectedTask(task.name)}
                        className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-l border-border/60 py-2 font-mono text-2xs text-muted-foreground transition-colors first:border-l-0 hover:bg-secondary/30 hover:text-foreground">
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
