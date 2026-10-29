import { RotateCw } from 'lucide-react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Skeleton } from '@/components/shared/Skeleton'
import { Notice } from '@/components/shared/Notice'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Switch } from '@/components/ui/switch'
import { useScreenBlackout, type BlackoutHostView } from './useScreenBlackout'

const TITLE = 'Screen blackout'

function hostStatus(host: BlackoutHostView): { label: string; variant: 'neutral' | 'accent' | 'warning' | 'danger' } {
  if (host.pending !== undefined) return { label: host.pending ? 'Turning on…' : 'Turning off…', variant: 'warning' }
  if (!host.available) return { label: 'Unavailable', variant: 'danger' }
  if (host.enabled === null) return { label: 'Unknown', variant: 'warning' }
  return host.enabled ? { label: 'On', variant: 'accent' } : { label: 'Off', variant: 'neutral' }
}

function RetryButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" size="xs" aria-label={label} onClick={onClick} disabled={disabled} className="max-sm:h-11">
      <RotateCw /> Retry
    </Button>
  )
}

function HostRow({ host, onToggle, onRetry }: {
  host: BlackoutHostView
  onToggle: (enabled: boolean) => void
  onRetry: () => void
}) {
  const labelId = `blackout-${host.host}-label`
  const status = hostStatus(host)
  const detail = host.writeError ? null : host.error
  return (
    <li className="flex flex-col gap-2 border-b border-border/50 py-3 first:pt-0 last:border-0 last:pb-0">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span id={labelId} className="font-mono text-sm text-foreground">{host.label}</span>
          <span aria-live="polite"><Chip variant={status.variant}>{status.label}</Chip></span>
        </div>
        <Switch
          aria-labelledby={labelId}
          aria-busy={host.pending !== undefined || undefined}
          checked={host.enabled === true}
          disabled={!host.canWrite}
          onCheckedChange={onToggle}
        />
      </div>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      {host.writeError && (
        <Notice tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Couldn’t turn {host.label} {host.writeError.desired ? 'on' : 'off'}: {host.writeError.message}</span>
            <RetryButton label={`Retry ${host.label}`} onClick={onRetry} disabled={!host.canWrite} />
          </div>
        </Notice>
      )}
    </li>
  )
}

/** Per-host switches for the black screen overlay. The overlay hides the display; it does not sleep the machine. */
export function ScreenBlackout({ delay = 0 }: { delay?: number }) {
  const { hosts, loading, statusError, refresh, setEnabled, retry } = useScreenBlackout()

  return (
    <section aria-label={TITLE}>
      <WidgetCard title={TITLE} description="Black overlay over each display. The machines stay awake." delay={delay}>
        {loading && (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading blackout status">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        )}
        {statusError && (
          <Notice tone={hosts ? 'warning' : 'danger'} className="mb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{hosts ? 'Status is out of date, switches are locked' : 'Couldn’t load blackout status'}: {statusError}</span>
              <RetryButton label="Retry status" onClick={refresh} />
            </div>
          </Notice>
        )}
        {hosts && (
          <ul className="flex flex-col">
            {hosts.map((host) => (
              <HostRow
                key={host.host}
                host={host}
                onToggle={(enabled) => setEnabled(host.host, enabled)}
                onRetry={() => retry(host.host)}
              />
            ))}
          </ul>
        )}
      </WidgetCard>
    </section>
  )
}
