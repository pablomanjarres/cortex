import { useState, useEffect, useRef } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Button } from '@/components/ui/button'
import { Play, Pause, RotateCcw, Brain, Clock } from 'lucide-react'

export function FocusPage() {
  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [sessions, setSessions] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1)
      }, 1000)
    } else if (timeLeft === 0) {
      setSessions((prev) => prev + 1)
      setTimeLeft(25 * 60)
      setIsRunning(false)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning, timeLeft])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  const reset = () => {
    setIsRunning(false)
    setTimeLeft(25 * 60)
  }

  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <WidgetCard title="Pomodoro Timer" delay={0} className="lg:col-span-1">
          <div className="flex flex-col items-center gap-6 py-6">
            <div className="text-6xl font-bold tabular-nums tracking-tight">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsRunning(!isRunning)}
              >
                {isRunning ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                {isRunning ? 'Pause' : 'Start'}
              </Button>
              <Button variant="secondary" size="sm" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Sessions today: <span className="font-semibold">{sessions}</span>
            </p>
          </div>
        </WidgetCard>

        <WidgetCard title="Deep Work" description="Today's focused hours" delay={0.1}>
          <div className="flex items-center gap-4 py-4">
            <Brain className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-3xl font-bold tabular-nums">
                {Math.floor((sessions * 25) / 60)}h {(sessions * 25) % 60}m
              </p>
              <p className="text-xs text-muted-foreground">Target: 4h/day</p>
            </div>
          </div>
        </WidgetCard>

        <WidgetCard title="Time Blocks" description="Plan vs actual" delay={0.2}>
          <div className="flex items-center gap-4 py-4">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Set up your time blocks</p>
          </div>
        </WidgetCard>
      </div>
    </PageShell>
  )
}
