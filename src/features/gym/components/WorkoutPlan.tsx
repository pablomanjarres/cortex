import { useState, useEffect, useRef } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Modal } from '@/components/shared/Modal'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import type { WorkoutDay, WorkoutSession, Exercise } from '@/types/gym'
import { ExerciseImage } from './ExerciseImage'
import {
  Play,
  Plus,
  Trash2,
  Pencil,
  Check,
  CheckCircle2,
  Waves,
  Square,
  ChevronDown,
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
  const [preview, setPreview] = useState<Exercise | null>(null)
  const [expandedEx, setExpandedEx] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) =>
    setExpandedEx((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

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
    <>
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  <span className="flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Completed — <span className="font-mono tabular-nums">{getSession(day.id)?.exercises[0]?.sets[0]?.reps ?? '?'}m</span>
                  </span>
                  <Button variant="ghost" size="xs" onClick={() => onResetSession(day.id)}>
                    Redo
                  </Button>
                </div>
              ) : swimStartedAt ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <span className="font-mono text-4xl font-medium tabular-nums text-foreground">
                    {formatTimer(swimElapsed)}
                  </span>
                  <Button variant="destructive" size="sm" onClick={() => stopSwimTimer(day.id)}>
                    <Square className="fill-current" />
                    Stop & Log
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={startSwimTimer}>
                  <Play />
                  Start Swim
                </Button>
              )}
            </div>
          ) : (
            /* Weight training card */
            <div className="space-y-3">
              {/* Day metadata editing */}
              {editingDay === day.id && (
                <div className="space-y-1.5 border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <label className="w-12 shrink-0 text-2xs text-muted-foreground">Name</label>
                    <Input
                      value={day.name}
                      onChange={(e) => updateDay(day.id, { name: e.target.value })}
                      className="h-7 flex-1 text-xs font-medium"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="w-12 shrink-0 text-2xs text-muted-foreground">Day</label>
                    <Input
                      value={day.dayOfWeek}
                      onChange={(e) => updateDay(day.id, { dayOfWeek: e.target.value })}
                      className="h-7 w-28 text-xs"
                    />
                    <label className="w-10 shrink-0 text-2xs text-muted-foreground">Time</label>
                    <Input
                      value={day.time}
                      onChange={(e) => updateDay(day.id, { time: e.target.value })}
                      className="h-7 flex-1 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Exercises */}
              {editingDay === day.id ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                        <th className="pb-1.5 pr-2 text-left font-medium">Exercise</th>
                        <th className="w-16 pb-1.5 pr-2 text-left font-medium">Sets</th>
                        <th className="w-20 pb-1.5 pr-2 text-left font-medium">Weight</th>
                        <th className="w-8 pb-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.exercises.map((ex) => (
                        <tr key={ex.id} className="group border-t border-border/60">
                          <td className="py-1.5 pr-2">
                            <div>
                              <Input
                                value={ex.name}
                                onChange={(e) => updateExercise(day.id, ex.id, { name: e.target.value })}
                                className="h-7 text-xs"
                              />
                              <Input
                                value={ex.notes}
                                onChange={(e) => updateExercise(day.id, ex.id, { notes: e.target.value })}
                                placeholder="Notes..."
                                className="mt-1 h-6 text-2xs text-muted-foreground"
                              />
                            </div>
                          </td>
                          <td className="py-1.5 pr-2 text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={ex.sets}
                                onChange={(e) => updateExercise(day.id, ex.id, { sets: Number(e.target.value) })}
                                className="h-7 w-12 text-xs tabular-nums"
                              />
                              <span className="text-foreground-faint">x</span>
                              <Input
                                value={ex.repsRange}
                                onChange={(e) => updateExercise(day.id, ex.id, { repsRange: e.target.value })}
                                className="h-7 w-16 text-xs"
                              />
                            </div>
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              value={ex.startWeight}
                              onChange={(e) => updateExercise(day.id, ex.id, { startWeight: e.target.value })}
                              className="h-7 text-xs"
                            />
                          </td>
                          <td className="py-1.5">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => removeExercise(day.id, ex.id)}
                              aria-label={`Remove ${ex.name}`}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="-mx-1 space-y-1">
                  {day.exercises.map((ex) => {
                    const expanded = expandedEx.has(ex.id)
                    return (
                      <div key={ex.id} className="rounded-md transition-colors hover:bg-muted/40">
                        <div className="flex items-center gap-3 px-1.5 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPreview(ex)}
                            aria-label={`Preview ${ex.name}`}
                            className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border/60 p-0"
                          >
                            <ExerciseImage name={ex.name} showBadge={false} className="h-14 w-14" />
                          </Button>
                          <button
                            onClick={() => ex.notes && toggleExpand(ex.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">{ex.name}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <Chip size="sm" className="tabular-nums text-foreground">
                                  {ex.sets}×{ex.repsRange}
                                </Chip>
                                {ex.startWeight && <Chip size="sm">{ex.startWeight}</Chip>}
                              </div>
                            </div>
                            {ex.notes && (
                              <ChevronDown
                                className={`h-5 w-5 shrink-0 text-foreground-faint transition-transform ${expanded ? 'rotate-180' : ''}`}
                              />
                            )}
                          </button>
                        </div>
                        {expanded && ex.notes && (
                          <p className="pb-2.5 pl-[4.75rem] pr-3 text-xs leading-relaxed text-muted-foreground">{ex.notes}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Edit mode actions */}
              {editingDay === day.id && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="xs" onClick={() => addExercise(day.id)}>
                    <Plus />
                    Add exercise
                  </Button>
                </div>
              )}

              {/* Bottom actions */}
              <div className="flex items-center justify-between pt-1">
                {isCompletedToday(day.id) ? (
                  <div className="space-y-2">
                    {(() => {
                      const session = getSession(day.id)
                      if (!session) return null
                      const completedSets = session.exercises.reduce((s, ex) => s + ex.sets.filter(set => set.completed).length, 0)
                      const totalSets = session.exercises.reduce((s, ex) => s + ex.sets.length, 0)
                      const totalVolume = session.exercises.reduce(
                        (s, ex) => s + ex.sets.filter(set => set.completed).reduce((v, set) => v + set.weight * set.reps, 0), 0
                      )
                      const duration = session.startedAt && session.finishedAt
                        ? Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)
                        : null
                      return (
                        <div className="flex items-center gap-3 font-mono text-xs tabular-nums text-muted-foreground">
                          <span>{completedSets}/{totalSets} sets</span>
                          {totalVolume > 0 && <span>{Math.round(totalVolume)} kg</span>}
                          {duration !== null && duration > 0 && <span>{duration} min</span>}
                        </div>
                      )
                    })()}
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-sm text-success">
                        <CheckCircle2 className="h-4 w-4" />
                        Completed today
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          if (confirm('This will start a new session and overwrite today\'s logged workout for ' + day.name + '. Continue?')) {
                            onStartWorkout(day.id)
                          }
                        }}
                      >
                        Redo
                      </Button>
                    </div>
                  </div>
                ) : todaySessions.length > 0 ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="opacity-50"
                    onClick={() => {
                      const done = todaySessions.map(s => s.workoutName).join(', ')
                      if (confirm(`You already completed ${done} today. Starting ${day.name} will replace it. Continue?`)) {
                        onStartWorkout(day.id)
                      }
                    }}
                  >
                    <Play />
                    Start Workout
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => onStartWorkout(day.id)}>
                    <Play />
                    Start Workout
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setEditingDay(editingDay === day.id ? null : day.id)}
                >
                  {editingDay === day.id ? (
                    <>
                      <Check />
                      Done
                    </>
                  ) : (
                    <>
                      <Pencil />
                      Edit
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </WidgetCard>
      ))}
    </div>

    <Modal
      open={!!preview}
      onOpenChange={(o) => !o && setPreview(null)}
      title={preview?.name}
      size="sm"
    >
      {preview && (
        <div>
          <ExerciseImage name={preview.name} className="h-64 w-full" />
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Chip size="sm" className="tabular-nums text-foreground">
              {preview.sets}×{preview.repsRange}
            </Chip>
            {preview.startWeight && <Chip size="sm">{preview.startWeight}</Chip>}
          </div>
          {preview.notes && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{preview.notes}</p>}
        </div>
      )}
    </Modal>
    </>
  )
}
