import { REST_PRESETS } from '@/types/gym'
import { SkipForward, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'

interface RestTimerProps {
  timeLeft: number // seconds remaining
  totalTime: number // total rest duration in seconds
  onSkip: () => void
  onAdjust: (delta: number) => void // ±seconds
  onChangeDuration: (seconds: number) => void
  currentDuration: number
}

/** Sticky, thumb-zone rest bar. Sits above the content instead of hiding the set list. */
export function RestTimer({ timeLeft, totalTime, onSkip, onAdjust, onChangeDuration, currentDuration }: RestTimerProps) {
  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const progress = totalTime > 0 ? Math.min(1, (totalTime - timeLeft) / totalTime) : 0

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="surface-strong w-full max-w-md overflow-hidden rounded-xl shadow-lift">
        <div className="h-1 w-full bg-muted/60">
          <div
            className="h-full rounded-full bg-success transition-all duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-3 p-3">
          <div className="flex flex-col">
            <span className="font-mono text-4xl font-medium leading-none tabular-nums text-foreground">
              {minutes}:{String(seconds).padStart(2, '0')}
            </span>
            <span className="font-mono text-2xs uppercase tracking-widest text-foreground-faint">Rest</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              className="h-12 w-12"
              onClick={() => onAdjust(-15)}
              aria-label="Subtract 15 seconds"
            >
              <Minus className="h-5 w-5" />
            </Button>
            <Button className="h-12 px-5 text-base" onClick={onSkip}>
              <SkipForward className="h-4 w-4" />
              Skip
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-12 w-12"
              onClick={() => onAdjust(15)}
              aria-label="Add 15 seconds"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div className="flex gap-1.5 px-3 pb-3">
          {REST_PRESETS.map((preset) => (
            <Chip
              key={preset}
              selectable
              selected={currentDuration === preset}
              onClick={() => onChangeDuration(preset)}
              className="px-3 py-1.5"
            >
              {preset >= 60 ? `${preset / 60}m` : `${preset}s`}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}
