import { REST_PRESETS } from '@/types/gym'
import { SkipForward, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RestTimerProps {
  timeLeft: number
  totalTime: number
  onSkip: () => void
  onAdjust: (delta: number) => void
  onChangeDuration: (seconds: number) => void
  currentDuration: number
}

export function RestTimer({ timeLeft, totalTime, onSkip, onAdjust, onChangeDuration, currentDuration }: RestTimerProps) {
  const progress = totalTime > 0 ? Math.max(0, Math.min(1, (totalTime - timeLeft) / totalTime)) : 0
  return (
    <section aria-label="Rest timer" className="mb-4 overflow-hidden rounded-xl border border-accent/20 bg-card">
      <div className="h-1 bg-muted"><div className="h-full bg-accent transition-[width] duration-1000" style={{ width: `${progress * 100}%` }} /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <p className="text-sm text-muted-foreground">Rest</p>
          <p role="timer" className="font-mono text-2xl font-medium tabular-nums">{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-lg" onClick={() => onAdjust(-15)} aria-label="Subtract 15 seconds"><Minus /></Button>
          <Button size="lg" onClick={onSkip}><SkipForward />Skip rest</Button>
          <Button variant="outline" size="icon-lg" onClick={() => onAdjust(15)} aria-label="Add 15 seconds"><Plus /></Button>
        </div>
      </div>
      <details className="border-t border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">Rest settings · {currentDuration}s</summary>
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          {REST_PRESETS.map((preset) => <Button key={preset} variant={currentDuration === preset ? 'accent-outline' : 'outline'} size="lg"
            aria-pressed={currentDuration === preset} onClick={() => onChangeDuration(preset)}>{preset}s</Button>)}
        </div>
      </details>
    </section>
  )
}
