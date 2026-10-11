import type { NoelleCrmSnapshot } from '../../../electron/noelle-crm'
import { Chip } from '@/components/ui/chip'
import { formatCrmTime } from './noelle-crm-model'

export function NoelleCrmSyncStatus({ snapshot }: { snapshot: NoelleCrmSnapshot | null }) {
  const status = snapshot?.status
  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Chip size="sm" variant={status?.error ? 'warning' : status?.lastSuccessfulSyncAt ? 'success' : 'neutral'}>
          {status?.error ? 'Sync needs attention' : status?.lastSuccessfulSyncAt ? 'Synced' : 'Waiting for sync'}
        </Chip>
        {snapshot?.pagination?.hasMore && <Chip size="sm" variant="warning">Contacts incomplete</Chip>}
        {status?.lastSuccessfulSyncAt && <span>Last successful sync <span className="font-mono">{formatCrmTime(status.lastSuccessfulSyncAt)}</span></span>}
        <span>Times shown in Bogotá</span>
      </div>
      {status?.error && (
        <p role="status" className="break-words text-warning">
          {status.error} {status.lastAttemptAt && <span className="text-muted-foreground">Last attempt {formatCrmTime(status.lastAttemptAt)}.</span>}
        </p>
      )}
    </div>
  )
}
