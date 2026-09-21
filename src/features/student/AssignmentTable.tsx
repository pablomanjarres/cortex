import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssignmentStatusControl } from './AssignmentStatusControl'
import { assignmentStatus, type AssignmentStatus } from './student-overview'
import type { Assignment, AssignmentType, Course } from './student-types'

const ASSIGNMENT_TYPES: AssignmentType[] = ['Exam', 'Quiz', 'Lab', 'Project', 'Presentation', 'Attendance']

export interface AssignmentActions {
  onOpenAssignment: (assignment: Assignment) => void
  onStatusChange: (id: string, status: AssignmentStatus) => void
  onDeadlineChange: (id: string, deadline?: string) => void
  onGradeChange: (id: string, grade?: number) => void
  onWeightChange: (id: string, weight: number) => void
  onTypeChange: (id: string, type: AssignmentType) => void
  onDeleteAssignment: (id: string) => void
}

interface AssignmentTableProps extends AssignmentActions {
  assignments: Assignment[]
  courseMap: Record<string, Course>
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function AssignmentTable({ assignments, courseMap, ...actions }: AssignmentTableProps) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table className="hidden w-full min-w-[760px] text-xs lg:table">
        <thead>
          <tr className="border-b border-border/60 text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Assignment</th>
            <th className="py-2 font-medium">Status</th>
            <th className="py-2 font-medium">Type</th>
            <th className="py-2 text-right font-medium">Weight</th>
            <th className="py-2 text-right font-medium">Grade</th>
            <th className="py-2 text-right font-medium">Deadline</th>
            <th className="w-10 py-2" />
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => (
            <tr key={assignment.id} id={`student-assignment-${assignment.id}`} tabIndex={-1} className="border-b border-border/45 last:border-0 focus:bg-accent/5">
              <td className="max-w-72 px-3 py-2.5">
                <button type="button" onClick={() => actions.onOpenAssignment(assignment)} className="block max-w-full text-left">
                  <span className="block truncate font-semibold hover:text-accent">{assignment.name}</span>
                  <span className="block truncate text-2xs text-muted-foreground">{courseMap[assignment.courseId]?.name}</span>
                </button>
              </td>
              <td className="py-2.5 pr-2">
                <AssignmentStatusControl assignmentName={assignment.name} status={assignmentStatus(assignment)} onChange={(status) => actions.onStatusChange(assignment.id, status)} compact />
              </td>
              <td className="py-2.5 pr-2">
                <select value={assignment.type} onChange={(event) => actions.onTypeChange(assignment.id, event.target.value as AssignmentType)} className="h-7 rounded-md border border-input bg-transparent px-1.5 text-2xs">
                  {ASSIGNMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </td>
              <td className="py-2.5 pr-2 text-right">
                <input aria-label={`Weight for ${assignment.name}`} type="number" min="0" max="100" step="0.1" value={assignment.weight * 100} onChange={(event) => actions.onWeightChange(assignment.id, Number(event.target.value) / 100)} className="w-14 bg-transparent text-right font-mono outline-none" />
              </td>
              <td className="py-2.5 pr-2 text-right">
                <input aria-label={`Grade for ${assignment.name}`} type="number" min="0" max="5" step="0.1" value={assignment.grade ?? ''} onChange={(event) => actions.onGradeChange(assignment.id, optionalNumber(event.target.value))} placeholder="—" className="w-12 bg-transparent text-right font-mono outline-none placeholder:text-foreground-faint" />
              </td>
              <td className="py-2.5 pr-2 text-right">
                <input aria-label={`Deadline for ${assignment.name}`} type="date" value={assignment.deadline ?? ''} onChange={(event) => actions.onDeadlineChange(assignment.id, event.target.value || undefined)} className="w-[112px] bg-transparent text-right font-mono text-2xs outline-none" />
              </td>
              <td className="py-2.5 pr-2">
                <Button variant="ghost" size="icon-xs" onClick={() => actions.onDeleteAssignment(assignment.id)} aria-label={`Delete ${assignment.name}`} className="hover:text-destructive">
                  <Trash2 />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
