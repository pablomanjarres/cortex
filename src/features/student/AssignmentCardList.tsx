import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssignmentStatusControl } from './AssignmentStatusControl'
import { assignmentStatus } from './student-overview'
import type { Assignment, Course } from './student-types'
import type { AssignmentActions } from './AssignmentTable'

interface AssignmentCardListProps extends AssignmentActions {
  assignments: Assignment[]
  courseMap: Record<string, Course>
}

export function AssignmentCardList({ assignments, courseMap, ...actions }: AssignmentCardListProps) {
  return (
    <div className="space-y-2 sm:hidden">
      {assignments.map((assignment) => (
        <article key={assignment.id} id={`student-assignment-card-${assignment.id}`} tabIndex={-1} className="rounded-xl border border-border/70 bg-card p-3 focus:border-accent/50">
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => actions.onOpenAssignment(assignment)} className="min-w-0 flex-1 text-left">
              <span className="block font-semibold leading-snug">{assignment.name}</span>
              <span className="mt-0.5 block text-2xs text-muted-foreground">{courseMap[assignment.courseId]?.name} · {assignment.type}</span>
            </button>
            <Button variant="ghost" size="icon-sm" onClick={() => actions.onDeleteAssignment(assignment.id)} aria-label={`Delete ${assignment.name}`} className="min-h-11 min-w-11 hover:text-destructive">
              <Trash2 />
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <AssignmentStatusControl assignmentName={assignment.name} status={assignmentStatus(assignment)} onChange={(status) => actions.onStatusChange(assignment.id, status)} />
            <label className="text-2xs text-muted-foreground">
              Deadline
              <input aria-label={`Deadline for ${assignment.name}`} type="date" value={assignment.deadline ?? ''} onChange={(event) => actions.onDeadlineChange(assignment.id, event.target.value || undefined)} className="mt-1 min-h-11 w-full rounded-xl border border-input bg-input/20 px-2 font-mono text-xs text-foreground outline-none" />
            </label>
            <label className="text-2xs text-muted-foreground">
              Grade
              <input aria-label={`Grade for ${assignment.name}`} type="number" min="0" max="5" step="0.1" value={assignment.grade ?? ''} onChange={(event) => actions.onGradeChange(assignment.id, event.target.value ? Number(event.target.value) : undefined)} placeholder="No grade" className="mt-1 min-h-11 w-full rounded-xl border border-input bg-input/20 px-3 font-mono text-xs text-foreground outline-none" />
            </label>
            <Button variant="secondary" size="sm" onClick={() => actions.onOpenAssignment(assignment)} className="min-h-11 self-end">Edit assignment</Button>
          </div>
        </article>
      ))}
    </div>
  )
}
