import { motion, useReducedMotion } from 'framer-motion'
import type { WorkoutDay, WorkoutSession, BodyStats } from '@/types/gym'

interface WeeklyStatsProps {
  plans: WorkoutDay[]
  weekSessions: WorkoutSession[]
  weekDates: string[]
  bodyStats: BodyStats[]
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function WeeklyStats({ weekSessions, weekDates, bodyStats }: WeeklyStatsProps) {
  const reduceMotion = useReducedMotion()
  const completed = weekSessions.length
  const target = 4
  const pct = Math.min(100, Math.round((completed / target) * 100))
  const todayIdx = (new Date().getDay() + 6) % 7 // 0=Mon

  // Map each day to its sessions (supports multiple workouts per day)
  const dayStatus = weekDates.map((date, i) => {
    const sessions = weekSessions.filter(s => s.date === date)
    return { date, dayLabel: DAY_LABELS[i], sessions, isToday: i === todayIdx }
  })

  // Total volume this week
  const totalSets = weekSessions.reduce(
    (sum, s) => sum + s.exercises.reduce((es, ex) => es + ex.sets.filter(set => set.completed).length, 0), 0
  )
  const totalVolume = weekSessions.reduce(
    (sum, s) => sum + s.exercises.reduce(
      (es, ex) => es + ex.sets.filter(set => set.completed).reduce((vs, set) => vs + set.weight * set.reps, 0), 0
    ), 0
  )

  // Latest weight
  const latestWeight = bodyStats.length > 0 ? bodyStats[bodyStats.length - 1].weight : null

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface mt-4 space-y-4 rounded-xl p-4"
    >
      {/* Top row: completion + KPIs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <svg width="52" height="52" className="-rotate-90">
              <circle cx="26" cy="26" r="22" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/60" />
              <circle cx="26" cy="26" r="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={2 * Math.PI * 22 * (1 - pct / 100)}
                className={`transition-all duration-700 ${completed >= target ? 'text-success' : 'text-foreground'}`}
              />
            </svg>
            <span className="absolute font-mono text-sm font-medium tabular-nums">{completed}/{target}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">This Week</p>
            <p className="text-xs text-muted-foreground">
              {completed >= target ? 'Goal reached!' : `${target - completed} more to go`}
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="text-center">
            <p className="font-mono text-lg font-medium tabular-nums">{totalSets}</p>
            <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Sets</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-lg font-medium tabular-nums">{totalVolume > 0 ? `${Math.round(totalVolume / 1000)}K` : '0'}</p>
            <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">Volume (kg)</p>
          </div>
          {latestWeight && (
            <div className="text-center">
              <p className="font-mono text-lg font-medium tabular-nums">{latestWeight}</p>
              <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">kg</p>
            </div>
          )}
        </div>
      </div>

      {/* Day-by-day bar */}
      <div className="flex items-center gap-1.5">
        {dayStatus.map(({ dayLabel, sessions, isToday }) => {
          const allCompleted = sessions.length > 0 && sessions.every(s => s.completedFully)
          const hasPartial = sessions.length > 0 && !allCompleted
          return (
            <div key={dayLabel} className="flex flex-1 flex-col items-center gap-1">
              <span className={`font-mono text-2xs ${isToday ? 'font-medium text-foreground' : 'text-foreground-faint'}`}>
                {dayLabel}
              </span>
              <div className={`flex h-8 w-full items-center justify-center rounded-md transition-all ${
                allCompleted
                  ? 'border border-success/25 bg-success/10'
                  : hasPartial
                    ? 'border border-warning/25 bg-warning/10'
                    : isToday
                      ? 'border border-border bg-muted/60'
                      : 'bg-muted/40'
              }`}>
                {sessions.length > 0 ? (
                  <span className={`font-mono text-3xs ${allCompleted ? 'text-success' : 'text-warning'}`}>
                    {sessions.map(s => s.workoutName).join('+')}
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
