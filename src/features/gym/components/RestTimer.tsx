import { REST_PRESETS } from '@/types/gym'

interface RestTimerProps {
  timeLeft: number          // seconds remaining
  totalTime: number         // total rest duration in seconds
  onSkip: () => void
  onChangeDuration: (seconds: number) => void
  currentDuration: number   // current preset
}

export function RestTimer({ timeLeft, totalTime, onSkip, onChangeDuration, currentDuration }: RestTimerProps) {
  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const progress = totalTime > 0 ? (totalTime - timeLeft) / totalTime : 0
  const circumference = 2 * Math.PI * 54
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* Circular progress */}
      <div className="relative flex items-center justify-center">
        <svg width="128" height="128" className="-rotate-90">
          <circle
            cx="64" cy="64" r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-foreground/10"
          />
          <circle
            cx="64" cy="64" r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="text-foreground transition-all duration-1000"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-3xl font-mono font-bold tabular-nums">
            {minutes}:{String(seconds).padStart(2, '0')}
          </span>
          <span className="text-xs text-muted-foreground mt-0.5">REST</span>
        </div>
      </div>

      {/* Skip button */}
      <button
        onClick={onSkip}
        className="rounded-lg bg-foreground/10 px-4 py-2 text-sm font-medium hover:bg-foreground/20 transition-colors"
      >
        Skip rest
      </button>

      {/* Duration presets */}
      <div className="flex gap-1.5">
        {REST_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => onChangeDuration(preset)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              currentDuration === preset
                ? 'bg-foreground text-background'
                : 'bg-foreground/10 text-muted-foreground hover:bg-foreground/20'
            }`}
          >
            {preset >= 60 ? `${preset / 60}m` : `${preset}s`}
          </button>
        ))}
      </div>
    </div>
  )
}
