import { useState } from 'react'
import { Pause, Play, RotateCcw, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SprintSession } from '@/lib/sprint-context'
import { formatMinutes } from './homePanelUtils'

export function FocusHero({
  isRunning,
  isPaused,
  timeLeft,
  task,
  duration,
  sessions,
  sessionCount,
  totalMinutes,
  onTaskChange,
  onDurationChange,
  onStart,
  onPause,
  onResume,
  onReset,
}: {
  isRunning: boolean
  isPaused: boolean
  timeLeft: number
  task: string
  duration: number
  sessions: SprintSession[]
  sessionCount: number
  totalMinutes: number
  onTaskChange: (value: string) => void
  onDurationChange: (value: number) => void
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
}) {
  const [showCustomTime, setShowCustomTime] = useState(false)
  const [customTimeInput, setCustomTimeInput] = useState('')
  const presets = [15, 25, 45, 60, 90]
  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60
  const primary = isRunning
    ? { label: 'Pause', icon: <Pause />, action: onPause }
    : isPaused
      ? { label: 'Resume', icon: <Play className="ml-0.5" />, action: onResume }
      : { label: 'Start', icon: <Play className="ml-0.5" />, action: onStart }

  const setCustomDuration = () => {
    const value = parseInt(customTimeInput)
    if (value > 0 && value <= 240) {
      onDurationChange(value)
      setShowCustomTime(false)
    }
  }

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-accent/20 bg-focus-surface p-5 text-[#140C38] shadow-card dark:text-white md:p-7">
      <div className="absolute -right-16 -top-20 size-56 rounded-full bg-white/28 blur-3xl dark:bg-lime-200/10" />
      <div className="relative flex h-full min-h-[22rem] flex-col">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#5A44B1] dark:text-[#DCD4FF]">
            <Target className="size-4" />
            Focus session
          </div>
          <span className="rounded-full bg-white/45 px-3 py-1 text-xs font-semibold text-[#5A44B1] dark:bg-white/12 dark:text-[#EEE9FF]">
            {sessionCount} today
          </span>
        </div>

        <div className="my-auto space-y-5 text-center">
          <Input
            value={task}
            onChange={(event) => onTaskChange(event.target.value)}
            placeholder="What are you working on?"
            className="mx-auto h-11 max-w-sm border-white/45 bg-white/45 text-center text-base font-semibold shadow-none placeholder:text-[#5D5382] dark:border-white/10 dark:bg-white/10 dark:placeholder:text-[#CBC3F3]"
          />
          <div className="font-mono text-6xl font-semibold tabular-nums tracking-tight md:text-7xl">
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>
          <p className="text-sm font-medium text-[#5D5382] dark:text-[#D8D0FF]">
            {totalMinutes > 0 ? `${formatMinutes(totalMinutes)} completed today` : 'No completed focus yet today'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={primary.action} className="min-w-36">
              {primary.icon}
              {primary.label}
            </Button>
            {(isRunning || isPaused) && (
              <Button variant="secondary" size="lg" onClick={onReset} className="border-white/45 bg-white/45 dark:border-white/10 dark:bg-white/10">
                <RotateCcw />
                Reset
              </Button>
            )}
          </div>
        </div>

        <div className="relative space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {presets.map((minutes) => (
              <Button
                key={minutes}
                size="xs"
                variant={duration === minutes && !showCustomTime ? 'default' : 'secondary'}
                disabled={isRunning || isPaused}
                className="font-mono"
                onClick={() => { onDurationChange(minutes); setShowCustomTime(false) }}
              >
                {minutes}m
              </Button>
            ))}
            <Button
              size="xs"
              variant={showCustomTime || !presets.includes(duration) ? 'default' : 'secondary'}
              disabled={isRunning || isPaused}
              className="font-mono"
              onClick={() => setShowCustomTime((value) => !value)}
            >
              {!presets.includes(duration) ? `${duration}m` : 'Set'}
            </Button>
          </div>
          {showCustomTime && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={240}
                value={customTimeInput}
                onChange={(event) => setCustomTimeInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setCustomDuration()
                }}
                placeholder="minutes"
                className="h-9 bg-white/55 dark:bg-white/10"
                autoFocus
              />
              <Button size="sm" onClick={setCustomDuration}>Set</Button>
            </div>
          )}
          {sessions.length > 0 && (
            <div className="rounded-2xl bg-white/35 p-3 dark:bg-white/10">
              <p className="mb-2 text-xs font-semibold text-[#5D5382] dark:text-[#D8D0FF]">Latest focus</p>
              <div className="space-y-1">
                {[...sessions].reverse().slice(0, 3).map((session) => (
                  <div key={session.id} className="flex items-center gap-2 text-xs">
                    <span className="font-mono tabular-nums text-[#5D5382] dark:text-[#D8D0FF]">
                      {new Date(session.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{session.task || 'Focus session'}</span>
                    <span className="font-mono tabular-nums">{session.duration}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
