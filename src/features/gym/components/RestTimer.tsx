import { REST_PRESETS } from '@/types/gym'
import { SkipForward, Minus, Plus } from 'lucide-react'

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
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-foreground/15 bg-card/95 shadow-2xl backdrop-blur-md">
        <div className="h-1.5 w-full bg-foreground/10">
          <div className="h-full bg-green-400 transition-all duration-1000 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="flex items-center gap-3 p-3">
          <div className="flex flex-col">
            <span className="text-4xl font-bold leading-none tabular-nums">
              {minutes}:{String(seconds).padStart(2, '0')}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60">Rest</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => onAdjust(-15)}
              aria-label="Subtract 15 seconds"
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-foreground transition-transform active:scale-95"
            >
              <Minus className="h-5 w-5" />
            </button>
            <button
              onClick={onSkip}
              className="flex h-12 items-center gap-1.5 rounded-xl bg-foreground px-5 text-base font-semibold text-background transition-transform active:scale-95"
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </button>
            <button
              onClick={() => onAdjust(15)}
              aria-label="Add 15 seconds"
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-foreground transition-transform active:scale-95"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex gap-1.5 px-3 pb-3">
          {REST_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => onChangeDuration(preset)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                currentDuration === preset ? 'bg-foreground/20 text-foreground' : 'bg-foreground/5 text-muted-foreground hover:bg-foreground/10'
              }`}
            >
              {preset >= 60 ? `${preset / 60}m` : `${preset}s`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
