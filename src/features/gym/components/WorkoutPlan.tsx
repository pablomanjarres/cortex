import { useState, useEffect, useRef } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import type { WorkoutDay, WorkoutSession, Exercise } from '@/types/gym'
import {
  Play,
  Plus,
  Trash2,
  Pencil,
  Check,
  CheckCircle2,
  Waves,
  Square,
} from 'lucide-react'

interface WorkoutPlanProps {
  plans: WorkoutDay[]
  onUpdatePlans: (plans: WorkoutDay[]) => void
  onStartWorkout: (dayId: string) => void
  onLogSwim: (dayId: string, duration: number) => void
  onResetSession: (dayId: string) => void
  todaySessions: WorkoutSession[]
}

export function WorkoutPlan({ plans, onUpdatePlans, onStartWorkout, onLogSwim, onResetSession, todaySessions }: WorkoutPlanProps) {
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const [swimStartedAt, setSwimStartedAt] = useState<number | null>(null)
  const [swimElapsed, setSwimElapsed] = useState(0)
  const swimTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (swimStartedAt) {
      swimTimerRef.current = setInterval(() => {
        setSwimElapsed(Math.floor((Date.now() - swimStartedAt) / 1000))
      }, 1000)
    }
    return () => {
      if (swimTimerRef.current) clearInterval(swimTimerRef.current)
    }
  }, [swimStartedAt])

  const startSwimTimer = () => {
    setSwimStartedAt(Date.now())
    setSwimElapsed(0)
  }

  const stopSwimTimer = (dayId: string) => {
    const durationMinutes = Math.max(1, Math.round(swimElapsed / 60))
    onLogSwim(dayId, durationMinutes)
    setSwimStartedAt(null)
    setSwimElapsed(0)
    if (swimTimerRef.current) clearInterval(swimTimerRef.current)
  }

  const formatTimer = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const updateExercise = (dayId: string, exerciseId: string, updates: Partial<Exercise>) => {
    onUpdatePlans(plans.map(d => d.id !== dayId ? d : {
      ...d,
      exercises: d.exercises.map(e => e.id !== exerciseId ? e : { ...e, ...updates }),
    }))
  }

  const updateDay = (dayId: string, updates: Partial<Pick<WorkoutDay, 'name' | 'dayOfWeek' | 'time'>>) => {
    onUpdatePlans(plans.map(d => d.id !== dayId ? d : { ...d, ...updates }))
  }

  const addExercise = (dayId: string) => {
    onUpdatePlans(plans.map(d => d.id !== dayId ? d : {
      ...d,
      exercises: [...d.exercises, {
        id: Date.now().toString(),
        name: 'New Exercise',
        sets: 3,
        repsRange: '10-12',
        startWeight: '',
        notes: '',
      }],
    }))
  }

  const removeExercise = (dayId: string, exerciseId: string) => {
    onUpdatePlans(plans.map(d => d.id !== dayId ? d : {
      ...d,
      exercises: d.exercises.filter(e => e.id !== exerciseId),
    }))
  }

  const isCompletedToday = (dayId: string) => todaySessions.some(s => s.workoutDayId === dayId)
  const getSession = (dayId: string) => todaySessions.find(s => s.workoutDayId === dayId)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mt-4">
      {plans.map((day, idx) => (
        <WidgetCard
          key={day.id}
          title={`Day ${idx + 1} — ${day.name}`}
          description={`${day.dayOfWeek} · ${day.time}`}
          delay={idx * 0.08}
          variant={isCompletedToday(day.id) ? 'success' : 'default'}
        >
          {day.name === 'SWIM' ? (
            /* Swim card */
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Waves className="h-4 w-4" />
                <span className="text-sm">Warm-up 4 lengths + 20 min continuous + cool-down</span>
              </div>
              {isCompletedToday(day.id) ? (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-green-400 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    Completed — {getSession(day.id)?.exercises[0]?.sets[0]?.reps ?? '?'}m
                  </span>
                  <button onClick={() => onResetSession(day.id)} className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                    Redo
                  </button>
                </div>
              ) : swimStartedAt ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <span className="text-4xl font-mono font-bold tabular-nums text-foreground">
                    {formatTimer(swimElapsed)}
                  </span>
                  <button
                    onClick={() => stopSwimTimer(day.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-red-500/20 text-red-400 px-4 py-2 text-sm font-medium hover:bg-red-500/30 transition-colors"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Stop & Log
                  </button>
                </div>
              ) : (
                <button
                  onClick={startSwimTimer}
                  className="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-3 py-1.5 text-sm font-medium hover:bg-foreground/20 transition-colors"
                >
                  <Play className="h-3.5 w-3.5" />
                  Start Swim
                </button>
              )}
            </div>
          ) : (
            /* Weight training card */
            <div className="space-y-3">
              {/* Day metadata editing */}
              {editingDay === day.id && (
                <div className="space-y-1.5 pb-2 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted-foreground/50 w-12 shrink-0">Name</label>
                    <input
                      value={day.name}
                      onChange={(e) => updateDay(day.id, { name: e.target.value })}
                      className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs font-semibold text-foreground outline-none focus:border-foreground/30"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted-foreground/50 w-12 shrink-0">Day</label>
                    <input
                      value={day.dayOfWeek}
                      onChange={(e) => updateDay(day.id, { dayOfWeek: e.target.value })}
                      className="h-7 w-28 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-foreground/30"
                    />
                    <label className="text-[10px] text-muted-foreground/50 w-10 shrink-0">Time</label>
                    <input
                      value={day.time}
                      onChange={(e) => updateDay(day.id, { time: e.target.value })}
                      className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-foreground/30"
                    />
                  </div>
                </div>
              )}

              {/* Exercise table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground/60">
                      <th className="text-left font-medium pb-1.5 pr-2">Exercise</th>
                      <th className="text-left font-medium pb-1.5 pr-2 w-16">Sets</th>
                      <th className="text-left font-medium pb-1.5 pr-2 w-20">Weight</th>
                      {editingDay === day.id && (
                        <th className="w-8 pb-1.5"></th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {day.exercises.map((ex) => (
                      <tr key={ex.id} className="group border-t border-border/30">
                        <td className="py-1.5 pr-2">
                          {editingDay === day.id ? (
                            <div>
                              <input
                                value={ex.name}
                                onChange={(e) => updateExercise(day.id, ex.id, { name: e.target.value })}
                                className="h-7 w-full rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-foreground/30"
                              />
                              <input
                                value={ex.notes}
                                onChange={(e) => updateExercise(day.id, ex.id, { notes: e.target.value })}
                                placeholder="Notes..."
                                className="mt-1 h-6 w-full rounded border border-border/50 bg-background px-2 text-[10px] text-muted-foreground outline-none focus:border-foreground/30"
                              />
                            </div>
                          ) : (
                            <div>
                              <span className="text-foreground">{ex.name}</span>
                              {ex.notes && (
                                <span className="ml-1.5 text-muted-foreground/50">{ex.notes}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-muted-foreground">
                          {editingDay === day.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={ex.sets}
                                onChange={(e) => updateExercise(day.id, ex.id, { sets: Number(e.target.value) })}
                                className="h-7 w-12 rounded border border-border bg-background px-2 text-xs text-foreground outline-none tabular-nums"
                              />
                              <span className="text-muted-foreground/50">x</span>
                              <input
                                value={ex.repsRange}
                                onChange={(e) => updateExercise(day.id, ex.id, { repsRange: e.target.value })}
                                className="h-7 w-16 rounded border border-border bg-background px-2 text-xs text-foreground outline-none"
                              />
                            </div>
                          ) : (
                            `${ex.sets}x${ex.repsRange}`
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-muted-foreground/60">
                          {editingDay === day.id ? (
                            <input
                              value={ex.startWeight}
                              onChange={(e) => updateExercise(day.id, ex.id, { startWeight: e.target.value })}
                              className="h-7 w-full rounded border border-border bg-background px-2 text-xs text-foreground outline-none"
                            />
                          ) : (
                            ex.startWeight
                          )}
                        </td>
                        {editingDay === day.id && (
                          <td className="py-1.5">
                            <button
                              onClick={() => removeExercise(day.id, ex.id)}
                              className="text-red-400/60 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Edit mode actions */}
              {editingDay === day.id && (
                <div className="flex gap-2">
                  <button
                    onClick={() => addExercise(day.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Add exercise
                  </button>
                </div>
              )}

              {/* Bottom actions */}
              <div className="flex items-center justify-between pt-1">
                {isCompletedToday(day.id) ? (
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-green-400 text-sm">
                      <CheckCircle2 className="h-4 w-4" />
                      Completed today
                    </span>
                    <button
                      onClick={() => {
                        if (confirm('This will start a new session and overwrite today\'s logged workout for ' + day.name + '. Continue?')) {
                          onStartWorkout(day.id)
                        }
                      }}
                      className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    >
                      Redo
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onStartWorkout(day.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-3 py-1.5 text-sm font-medium hover:bg-foreground/20 transition-colors"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Start Workout
                  </button>
                )}

                <button
                  onClick={() => setEditingDay(editingDay === day.id ? null : day.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  {editingDay === day.id ? (
                    <>
                      <Check className="h-3 w-3" />
                      Done
                    </>
                  ) : (
                    <>
                      <Pencil className="h-3 w-3" />
                      Edit
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </WidgetCard>
      ))}
    </div>
  )
}
