import { WidgetCard } from '@/components/widgets/WidgetCard'
import { useStore } from '@/lib/store'
import type { GtmDailyLog } from '@/types/gtm'

interface PipelineTask {
  key: string
  label: string
  type: string
  freq: string
  status: string
  contentId?: string
}

interface PipelineState {
  date: string
  weekKey: string
  tasks: PipelineTask[]
  frozenTasks: string[]
  pct: number
  updatedAt: string
  source: string
}

const EMPTY: PipelineState = {
  date: '',
  weekKey: '',
  tasks: [],
  frozenTasks: [],
  pct: 0,
  updatedAt: '',
  source: '',
}

const PLATFORM_COLORS: Record<string, string> = {
  'x-post': '#1da1f2',
  'linkedin-post': '#0a66c2',
  'ig-short': '#e1306c',
  'tiktok-short': '#00f2ea',
  'yt-short': '#ff0000',
  'reddit-post': '#ff4500',
  'yt-video': '#ff0000',
}

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  'posted': { label: 'Posted', bg: 'bg-green-500/15', text: 'text-green-400' },
  'in-progress': { label: 'Working', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  'skipped': { label: 'Skipped', bg: 'bg-zinc-500/15', text: 'text-zinc-400' },
  'pending': { label: 'Pending', bg: 'bg-secondary/50', text: 'text-muted-foreground' },
  'frozen': { label: 'Frozen', bg: 'bg-secondary/30', text: 'text-muted-foreground/50' },
}

interface Props {
  log: GtmDailyLog
  onUpdateLog: (log: GtmDailyLog) => void
}

export function ContentPipeline({ log, onUpdateLog }: Props) {
  const [pipeline, setPipeline] = useStore<PipelineState>('cortex-content-pipeline-daily', EMPTY)

  if (!pipeline.date || pipeline.tasks.length === 0) {
    return (
      <WidgetCard title="CONTENT PIPELINE" description="Syncs from Content Pipeline app" delay={0.2} compact>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-4 text-xs text-muted-foreground flex-1">
            <span className="inline-block h-2 w-2 rounded-full bg-zinc-600 animate-pulse" />
            Waiting for Content Pipeline...
          </div>
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-3 shrink-0 rounded-lg bg-secondary/80 hover:bg-secondary px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Open App &rarr;
          </a>
        </div>
      </WidgetCard>
    )
  }

  const activeTasks = pipeline.tasks.filter(t => t.status !== 'frozen')
  const frozenTasks = pipeline.tasks.filter(t => t.status === 'frozen')
  const postedCount = activeTasks.filter(t => t.status === 'posted').length

  const handleSkipToggle = (taskKey: string, currentStatus: string) => {
    const newStatus = currentStatus === 'skipped' ? 'pending' : 'skipped'
    setPipeline((prev) => ({
      ...prev,
      source: 'cortex',
      updatedAt: new Date().toISOString(),
      tasks: prev.tasks.map(t =>
        t.key === taskKey ? { ...t, status: newStatus } : t
      ),
    }))
  }

  // Cancel = revert a posted/in-progress task back to pending (it didn't go through)
  const handleCancel = (taskKey: string) => {
    setPipeline((prev) => {
      const updatedTasks = prev.tasks.map(t =>
        t.key === taskKey ? { ...t, status: 'pending' } : t
      )
      const newPostedCount = updatedTasks.filter(t => t.status === 'posted').length
      onUpdateLog({ ...log, postsPublished: newPostedCount })
      return {
        ...prev,
        source: 'cortex',
        updatedAt: new Date().toISOString(),
        tasks: updatedTasks,
      }
    })
  }

  return (
    <WidgetCard title="CONTENT PIPELINE" description={`${pipeline.date} — ${pipeline.pct}% complete`} delay={0.2}>
      <div className="flex flex-col gap-2">
        {activeTasks.map(task => {
          const badge = STATUS_BADGE[task.status] || STATUS_BADGE['pending']
          const color = PLATFORM_COLORS[task.key] || '#71717a'
          const isPosted = task.status === 'posted'
          const isWorking = task.status === 'in-progress'
          const isSkipped = task.status === 'skipped'
          const isPending = task.status === 'pending'

          return (
            <div
              key={task.key}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                isPosted ? 'bg-green-500/[0.05]' : 'bg-secondary/50'
              }`}
            >
              <div className="h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: isSkipped ? '#52525b' : color }} />
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${isSkipped ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                  {task.label}
                </div>
                <div className="text-[11px] text-muted-foreground">{task.type === 'video' ? 'Video' : 'Post'}{task.freq === 'weekly' ? ' — weekly' : ''}</div>
              </div>

              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${badge.bg} ${badge.text}`}>
                {badge.label}
              </span>

              {/* Cancel button — revert posted/working tasks that didn't go through */}
              {(isPosted || isWorking) && (
                <button
                  onClick={() => handleCancel(task.key)}
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-red-400 bg-secondary/80 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Didn't go through — revert to pending"
                >
                  Cancel
                </button>
              )}

              {/* Skip toggle for pending/skipped */}
              {(isPending || isSkipped) && (
                <button
                  onClick={() => handleSkipToggle(task.key, task.status)}
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground bg-secondary/80 hover:bg-secondary transition-colors cursor-pointer"
                >
                  {isSkipped ? 'Undo' : 'Skip'}
                </button>
              )}
            </div>
          )
        })}

        {/* Footer: frozen list + open app button */}
        <div className="flex items-center justify-between mt-2">
          <div className="text-[11px] text-muted-foreground/60">
            {frozenTasks.length > 0 && (
              <span>{frozenTasks.length} frozen: {frozenTasks.map(t => t.label).join(', ')}</span>
            )}
            {postedCount > 0 && (
              <span className={frozenTasks.length > 0 ? 'ml-2' : ''}>
                <span className="text-green-400/70">{postedCount} posted today</span>
              </span>
            )}
          </div>
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg bg-secondary/80 hover:bg-secondary px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Open Pipeline &rarr;
          </a>
        </div>
      </div>
    </WidgetCard>
  )
}
