import { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/shared/Modal'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { WorkoutPlanEditor } from './WorkoutPlanEditor'
import { WorkoutExerciseList } from './WorkoutExerciseList'
import { WorkoutOverview } from './WorkoutOverview'
import type { WorkoutDay, WorkoutSession, Exercise } from '@/types/gym'
import { ExerciseImage } from './ExerciseImage'


interface WorkoutPlanProps {
  plans: WorkoutDay[]
  onUpdatePlans: (plans: WorkoutDay[]) => void
  onStartWorkout: (dayId: string) => void
  onLogSwim: (dayId: string, duration: number) => void
  onResetSession: (dayId: string) => void
  todaySessions: WorkoutSession[]
}

export function WorkoutPlan({ plans, onUpdatePlans, onStartWorkout, onLogSwim, todaySessions }: WorkoutPlanProps) {
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(() => {
    const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
    return (plans.find((day) => day.dayOfWeek.trim().toLowerCase() === weekday) ?? plans[0])?.id
  })
  const selectedDay = plans.find((day) => day.id === selectedId) ?? plans[0]
  const latestSession = todaySessions.at(-1)
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

  if (!selectedDay) {
    return <p className="py-8 text-sm text-muted-foreground">No workout plans available.</p>
  }

  return (
    <>
    <WorkoutOverview
      plans={plans}
      selectedDay={selectedDay}
      onSelect={setSelectedId}
      onStart={() => {
        if (latestSession && !confirm(`Starting ${selectedDay.name} will replace today’s saved workout when finished. Continue?`)) return
        if (selectedDay.name.trim().toUpperCase() === 'SWIM') startSwimTimer()
        else onStartWorkout(selectedDay.id)
      }}
      onView={() => setDetailsOpen(true)}
      onEdit={() => setEditingDay(selectedDay.id)}
      session={latestSession}
      swimElapsed={swimStartedAt === null ? null : swimElapsed}
      onStopSwim={() => stopSwimTimer(selectedDay.id)}
    />

    <Modal
      open={detailsOpen}
      onOpenChange={setDetailsOpen}
      title={selectedDay.name}
      description={selectedDay.name.trim().toUpperCase() === 'SWIM' ? 'Swim plan' : 'Tap an exercise to view its movement and notes.'}
      size="lg"
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto [&_[data-slot=dialog-close]]:size-11"
    >
      {selectedDay.name.trim().toUpperCase() === 'SWIM' ? (
        <ol className="list-inside list-decimal space-y-4 py-2 text-base">
          <li>Warm up with 4 lengths.</li>
          <li>Swim continuously for 20 minutes.</li>
          <li>Finish with an easy cool-down.</li>
        </ol>
      ) : <WorkoutExerciseList exercises={selectedDay.exercises} onPreview={setPreview} />}
    </Modal>

    <Modal
      open={editingDay !== null}
      onOpenChange={(open) => !open && setEditingDay(null)}
      title="Edit plan"
      description="Changes are saved as you edit."
      size="lg"
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto [&_[data-slot=dialog-close]]:size-11"
      footer={<Button size="lg" className="min-h-12" onClick={() => setEditingDay(null)}>Done</Button>}
    >
      <WorkoutPlanEditor
        day={selectedDay}
        onUpdateDay={(updates) => updateDay(selectedDay.id, updates)}
        onUpdateExercise={(exerciseId, updates) => updateExercise(selectedDay.id, exerciseId, updates)}
        onAddExercise={() => addExercise(selectedDay.id)}
        onRemoveExercise={(exerciseId) => removeExercise(selectedDay.id, exerciseId)}
      />
    </Modal>

    <Modal
      open={!!preview}
      onOpenChange={(o) => !o && setPreview(null)}
      title={preview?.name}
      size="sm"
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto [&_[data-slot=dialog-close]]:size-11"
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
