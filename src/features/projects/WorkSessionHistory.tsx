import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import type { WorkSession } from '../../../electron/work-hours-model'
import { dateTime, duration } from './work-hours-ui'

interface WorkSessionHistoryProps {
  sessions: WorkSession[]
  busy: boolean
  onToggleBillable: (session: WorkSession) => void
  onEdit: (sessionId: string) => void
}

export function WorkSessionHistory({ sessions, busy, onToggleBillable, onEdit }: WorkSessionHistoryProps) {
  return (
    <WidgetCard title="Session history" description="Correct dates, describe the work, and mark time as billable or nonbillable.">
      {sessions.length === 0 ? (
        <EmptyState message="No saved sessions yet." hint="Press Start, then Stop to save an interval." className="py-5" />
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm tabular-nums">{duration(session.durationMs)}</p>
                  <Chip size="sm" variant={session.needsReview ? 'warning' : session.billable ? 'success' : 'neutral'}>
                    {session.needsReview ? 'Interrupted · review required' : session.billable ? 'Billable' : 'Nonbillable'}
                  </Chip>
                  {session.corrections.length > 0 && <Chip size="sm">Corrected</Chip>}
                </div>
                <p className="mt-1 text-sm">{session.description || 'Untitled work session'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{dateTime(session.startedAt)} – {dateTime(session.endedAt)}</p>
                {session.prUrl && <a className="mt-1 inline-block max-w-full truncate text-xs text-accent underline" href={session.prUrl} target="_blank" rel="noopener noreferrer">{session.prUrl}</a>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!session.needsReview && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onToggleBillable(session)} disabled={busy}>
                    Mark {session.billable ? 'nonbillable' : 'billable'}
                  </Button>
                )}
                <Button type="button" variant={session.needsReview ? 'accent-outline' : 'secondary'} size="sm" onClick={() => onEdit(session.id)} disabled={busy}>
                  {session.needsReview ? 'Review' : 'Edit'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}
