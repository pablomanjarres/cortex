import { REST_PRESETS } from '@/types/gym'
import { Minus, Plus, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/shared/Modal'
import { useState } from 'react'

interface RestTimerProps {
  timeLeft: number
  totalTime: number
  onSkip: () => void
  onAdjust: (delta: number) => void
  onChangeDuration: (seconds: number) => void
  currentDuration: number
}

export function RestTimer({ timeLeft, totalTime, onSkip, onAdjust, onChangeDuration, currentDuration }: RestTimerProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const progress = totalTime > 0 ? Math.max(0, Math.min(1, (totalTime - timeLeft) / totalTime)) : 0
  return (
    <section aria-label="Rest timer" className="mb-4 overflow-hidden rounded-lg bg-focus-surface/60">
      <div className="flex items-center justify-between gap-2 p-2">
        <div className="pl-1">
          <p className="text-xs text-muted-foreground">Rest</p>
          <p role="timer" className="font-mono text-xl font-medium tabular-nums">{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="lg" className="px-3" onClick={onSkip}>Skip rest</Button>
          <Button variant="ghost" size="icon-lg" onClick={() => setSettingsOpen(true)} aria-label="Rest settings"><Settings2 /></Button>
        </div>
      </div>
      <div className="h-0.5 bg-muted"><div className="h-full bg-accent transition-[width] duration-1000" style={{ width: `${progress * 100}%` }} /></div>
      <Modal open={settingsOpen} onOpenChange={setSettingsOpen} title="Rest settings" description="Adjust this break or choose your usual rest time.">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button variant="outline" size="lg" onClick={() => onAdjust(-15)} aria-label="Subtract 15 seconds"><Minus />15s</Button>
          <span className="font-mono text-xl tabular-nums">{timeLeft}s</span>
          <Button variant="outline" size="lg" onClick={() => onAdjust(15)} aria-label="Add 15 seconds"><Plus />15s</Button>
        </div>
        <p className="mb-2 text-sm text-muted-foreground">Default rest time</p>
        <div className="flex flex-wrap gap-2">
          {REST_PRESETS.map((preset) => <Button key={preset} variant={currentDuration === preset ? 'accent-outline' : 'outline'} size="lg"
            aria-pressed={currentDuration === preset} onClick={() => onChangeDuration(preset)}>{preset}s</Button>)}
        </div>
      </Modal>
    </section>
  )
}
