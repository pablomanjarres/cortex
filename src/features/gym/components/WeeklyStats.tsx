import { motion } from 'framer-motion'
import type { WorkoutDay, WorkoutSession, BodyStats } from '@/types/gym'

interface WeeklyStatsProps {
  plans: WorkoutDay[]
  weekSessions: WorkoutSession[]
  weekDates: string[]
  bodyStats: BodyStats[]
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function WeeklyStats({ weekSessions, weekDates, bodyStats }: WeeklyStatsProps) {
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-xl border border-border bg-card p-4 space-y-4"
    >
      {/* Top row: completion + KPIs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <svg width="52" height="52" className="-rotate-90">
              <circle cx="26" cy="26" r="22" fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground/10" />
              <circle cx="26" cy="26" r="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={2 * Math.PI * 22 * (1 - pct / 100)}
                className={`transition-all duration-700 ${completed >= target ? 'text-green-400' : 'text-foreground'}`}
              />
            </svg>
            <span className="absolute text-sm font-bold tabular-nums">{completed}/{target}</span>
          </div>
          <div>
            <p className="text-sm font-semibold">This Week</p>
            <p className="text-xs text-muted-foreground">
              {completed >= target ? 'Goal reached!' : `${target - completed} more to go`}
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="text-center">
            <p className="text-lg font-bold tabular-nums">{totalSets}</p>
            <p className="text-[10px] text-muted-foreground">Sets</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold tabular-nums">{totalVolume > 0 ? `${Math.round(totalVolume / 1000)}K` : '0'}</p>
            <p className="text-[10px] text-muted-foreground">Volume (kg)</p>
          </div>
          {latestWeight && (
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums">{latestWeight}</p>
              <p className="text-[10px] text-muted-foreground">kg</p>
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
            <div key={dayLabel} className="flex-1 flex flex-col items-center gap-1">
              <span className={`text-[10px] ${isToday ? 'text-foreground font-semibold' : 'text-muted-foreground/50'}`}>
                {dayLabel}
              </span>
              <div className={`w-full h-8 rounded-md flex items-center justify-center transition-all ${
                allCompleted
                  ? 'bg-green-500/20 border border-green-500/30'
                  : hasPartial
                    ? 'bg-amber-500/20 border border-amber-500/30'
                    : isToday
                      ? 'bg-foreground/10 border border-foreground/20'
                      : 'bg-foreground/5'
              }`}>
                {sessions.length > 0 ? (
                  <div className="flex flex-col items-center">
                    <span className={`text-[9px] font-medium ${allCompleted ? 'text-green-400' : 'text-amber-400'}`}>
                      {sessions.map(s => s.workoutName).join('+')}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
