import { useState, useEffect, useRef } from 'react'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Modal } from '@/components/shared/Modal'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { WorkoutPlanEditor } from './WorkoutPlanEditor'
import { WorkoutExerciseList } from './WorkoutExerciseList'
import { WorkoutSessionSummary } from './WorkoutSessionSummary'
import type { WorkoutDay, WorkoutSession, Exercise } from '@/types/gym'
import { ExerciseImage } from './ExerciseImage'
import {
  Play,
  Pencil,
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
  const [preview, setPreview] = useState<Exercise | null>(null)

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
              {editingDay === day.id ? (
                <WorkoutPlanEditor
                  day={day}
                  onUpdateDay={(updates) => updateDay(day.id, updates)}
                  onUpdateExercise={(exerciseId, updates) => updateExercise(day.id, exerciseId, updates)}
                  onAddExercise={() => addExercise(day.id)}
                  onRemoveExercise={(exerciseId) => removeExercise(day.id, exerciseId)}
                />
              ) : (
                <WorkoutExerciseList exercises={day.exercises} onPreview={setPreview} />
              )}

              {getSession(day.id) && <WorkoutSessionSummary session={getSession(day.id)!} />}
              <div className="flex items-center justify-between gap-3">
                <Button size="lg" onClick={() => {
                  if (todaySessions.length === 0 || confirm(`Starting ${day.name} will replace today’s saved workout when finished. Continue?`)) {
                    onStartWorkout(day.id)
                  }
                }}>
                  <Play /> {isCompletedToday(day.id) ? 'Redo workout' : 'Start workout'}
                </Button>
                <Button variant="ghost" size="lg" onClick={() => setEditingDay(editingDay === day.id ? null : day.id)}>
                  <Pencil /> {editingDay === day.id ? 'Done' : 'Edit plan'}
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
