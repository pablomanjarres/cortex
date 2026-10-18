import { useNavigate } from 'react-router-dom'
import { CloudUpload, GitMerge, Laptop, Monitor, RefreshCw } from 'lucide-react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { StatTile } from '@/components/shared/StatTile'
import { Skeleton } from '@/components/shared/Skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { useKnowledgeHealth } from './useKnowledgeHealth'
import { formatAge, type CheckGroup, type ProtectionCheck, type ProtectionState, type Tone } from './eightfold-view'

const TONE_CHIP: Record<Tone, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ok: 'success', warning: 'warning', danger: 'danger', unknown: 'neutral',
}
const STATE_TONE: Record<ProtectionState, Tone> = {
  ok: 'ok', attention: 'danger', stale: 'warning', unknown: 'unknown', missing: 'unknown', unavailable: 'unknown',
}
const GROUPS: CheckGroup[] = ['Sync', 'Backups', 'Evidence']

const ageSince = (at: string | null) => (at ? (Date.now() - Date.parse(at)) / 1000 : null)
const countText = (n: number | null) => (n == null ? '—' : String(n))

function When({ at, prefix = '' }: { at: string | null; prefix?: string }) {
  if (!at) return null
  return <time dateTime={at} title={new Date(at).toLocaleString()}>{prefix}{formatAge(ageSince(at))}</time>
}

function CheckRow({ check }: { check: ProtectionCheck }) {
  return (
    <li className="flex flex-col gap-1 border-b border-border/50 py-2.5 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{check.label}</span>
        <Chip size="sm" variant={TONE_CHIP[check.tone]}>{check.status}</Chip>
      </div>
      <p className="text-xs text-muted-foreground">{check.detail}</p>
      {check.at && <p className="font-mono text-2xs text-foreground-faint"><When at={check.at} /></p>}
    </li>
  )
}

/** Eightfold vault sync, backup and recovery status, read from the runtime's report. */
export function EightfoldProtection({ delay = 0 }: { delay?: number }) {
  const { view, refreshing, refresh } = useKnowledgeHealth()
  const navigate = useNavigate()

  const refreshButton = (
    <Button variant="secondary" size="sm" onClick={refresh} disabled={refreshing} aria-label="Refresh protection status">
      <RefreshCw className={cn(refreshing && 'motion-safe:animate-spin')} />
      {refreshing ? 'Checking…' : 'Refresh'}
    </Button>
  )

  return (
    <WidgetCard
      id="eightfold-protection"
      title="Sync and protection"
      description="Eightfold vault · checked every minute"
      variant={view?.state === 'attention' ? 'urgent' : 'default'}
      delay={delay}
    >
      {!view ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading protection status">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-32 w-full" />
        </div>
      ) : view.checks.length === 0 ? (
        <EmptyState message={view.headline} hint={view.note} action={refreshButton} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1" role="status" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2">
                <Chip variant={TONE_CHIP[STATE_TONE[view.state]]}>{view.headline}</Chip>
                <span className="font-mono text-2xs text-foreground-faint">
                  <When at={view.reportAt} prefix="Report " />
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{view.note}</p>
            </div>
            {refreshButton}
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile label="Mac pending" icon={<Laptop />} value={countText(view.macPending)} sub={view.macPending == null ? 'Not reported' : 'items to sync'} />
            <StatTile label="Windows pending" icon={<Monitor />} value={countText(view.windowsPending)} sub={view.windowsPending == null ? 'Not reported' : 'items to sync'} />
            <StatTile
              label="Conflicts"
              icon={<GitMerge />}
              value={<span className={cn(view.conflicts != null && view.conflicts > 0 && 'text-destructive')}>{countText(view.conflicts)}</span>}
              sub={view.conflicts == null ? 'Not reported' : 'colliding edits'}
            />
            <StatTile
              label="Verified cloud checkpoint"
              icon={<CloudUpload />}
              value={view.cloudCheckpointAt ? formatAge(ageSince(view.cloudCheckpointAt)) : '—'}
              sub={view.cloudCheckpointAt ? new Date(view.cloudCheckpointAt).toLocaleString() : 'None verified yet'}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {GROUPS.map((group) => (
              <section key={group} aria-label={group} className="min-w-0">
                <h4 className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">{group}</h4>
                <ul className="mt-1">
                  {view.checks.filter((c) => c.group === group).map((check) => <CheckRow key={check.id} check={check} />)}
                </ul>
              </section>
            ))}
          </div>

          <p className="flex flex-wrap items-center gap-1 text-xs text-foreground-faint">
            Recent activity lives in
            <Button variant="link" size="xs" className="h-auto px-0" onClick={() => navigate('/founder')}>Founder</Button>
            and
            <Button variant="link" size="xs" className="h-auto px-0" onClick={() => navigate('/daily')}>Daily</Button>
          </p>
        </div>
      )}
    </WidgetCard>
  )
}
