import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Exercise, WorkoutDay } from '@/types/gym'

function PlanField({ label, value, onChange, type = 'text' }: {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: 'text' | 'number'
}) {
  return (
    <label className="block min-w-0 space-y-2 text-sm font-medium">
      <span>{label}</span>
      <Input
        type={type}
        min={type === 'number' ? 1 : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 text-base"
      />
    </label>
  )
}

export function WorkoutPlanEditor({ day, onUpdateDay, onUpdateExercise, onAddExercise, onRemoveExercise }: {
  day: WorkoutDay
  onUpdateDay: (updates: Partial<Pick<WorkoutDay, 'name' | 'dayOfWeek' | 'time'>>) => void
  onUpdateExercise: (exerciseId: string, updates: Partial<Exercise>) => void
  onAddExercise: () => void
  onRemoveExercise: (exerciseId: string) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <PlanField label="Workout name" value={day.name} onChange={(name) => onUpdateDay({ name })} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlanField label="Day of week" value={day.dayOfWeek} onChange={(dayOfWeek) => onUpdateDay({ dayOfWeek })} />
          <PlanField label="Time" value={day.time} onChange={(time) => onUpdateDay({ time })} />
        </div>
      </div>

      {day.exercises.map((exercise, index) => (
        <section key={exercise.id} className="space-y-4 rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Exercise {index + 1}</h3>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => onRemoveExercise(exercise.id)}
              aria-label={`Remove ${exercise.name}`}
              className="min-h-11 text-destructive"
            >
              <Trash2 /> Remove
            </Button>
          </div>
          <PlanField
            label="Exercise name"
            value={exercise.name}
            onChange={(name) => onUpdateExercise(exercise.id, { name })}
          />
          <div className="grid grid-cols-2 gap-4">
            <PlanField
              label="Sets"
              type="number"
              value={exercise.sets}
              onChange={(value) => {
                const sets = Number(value)
                if (Number.isInteger(sets) && sets > 0 && sets <= 100) onUpdateExercise(exercise.id, { sets })
              }}
            />
            <PlanField
              label="Reps"
              value={exercise.repsRange}
              onChange={(repsRange) => onUpdateExercise(exercise.id, { repsRange })}
            />
          </div>
          <PlanField
            label="Starting weight"
            value={exercise.startWeight}
            onChange={(startWeight) => onUpdateExercise(exercise.id, { startWeight })}
          />
          <PlanField
            label="Notes"
            value={exercise.notes}
            onChange={(notes) => onUpdateExercise(exercise.id, { notes })}
          />
        </section>
      ))}

      <Button variant="secondary" size="lg" className="min-h-12 w-full" onClick={onAddExercise}>
        <Plus /> Add exercise
      </Button>
    </div>
  )
}
