import { Button } from '@/components/ui/button'
import { useWorkoutWakeLock } from '../hooks/use-workout-wake-lock'

export function WorkoutAwakeControl({ active }: { active: boolean }) {
  const wakeLock = useWorkoutWakeLock(active)
  const status = !wakeLock.enabled ? 'Keep screen on is off' : {
    idle: 'Keep screen on',
    requesting: 'Requesting screen control',
    held: 'Screen stays on',
    insecure: 'Screen control needs HTTPS',
    unsupported: 'Screen control unavailable',
    blocked: 'Screen control paused',
    released: 'Screen control paused',
  }[wakeLock.status]
  const retryable = wakeLock.enabled && (wakeLock.status === 'blocked' || wakeLock.status === 'released')
  return (
    <details className="mt-3 rounded-lg border border-border">
      <summary className="flex min-h-12 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">
        <span className="font-medium">Session options</span><span className="text-muted-foreground">{status}</span>
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        <p role="status" className="text-sm text-muted-foreground">{status}.</p>
        <p className="text-sm text-muted-foreground">
          {wakeLock.status === 'insecure' ? 'Open the secure HTTPS address to keep the screen on.'
            : wakeLock.status === 'unsupported' ? 'This browser does not support keeping the screen awake.'
              : retryable ? 'Your device released or declined screen control. Battery saver or device settings may prevent it.'
                : 'Keep the screen awake while this workout is open. Your device can still release screen control.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" aria-pressed={wakeLock.enabled} aria-label="Keep screen on" onClick={() => wakeLock.setEnabled(!wakeLock.enabled)}>
            Keep screen on: {wakeLock.enabled ? 'On' : 'Off'}
          </Button>
          {retryable && <Button variant="outline" size="lg" onClick={wakeLock.retry}>Retry screen control</Button>}
        </div>
      </div>
    </details>
  )
}
