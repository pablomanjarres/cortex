import type { ReactNode } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/shared/EmptyState'
import { AssignmentStatusControl } from './AssignmentStatusControl'
import { AssignmentTable, type AssignmentActions } from './AssignmentTable'
import { AssignmentCardList } from './AssignmentCardList'
import { ASSIGNMENT_STATUSES, assignmentStatus, type AssignmentStatus } from './student-overview'
import { daysUntil, fmtDate, type Assignment, type AssignmentType, type Course, type SortKey } from './student-types'

const ASSIGNMENT_TYPES: AssignmentType[] = ['Exam', 'Quiz', 'Lab', 'Project', 'Presentation', 'Attendance']

interface AssignmentWorkspaceProps extends AssignmentActions {
  assignments: Assignment[]
  dueSoon: Assignment[]
  courseMap: Record<string, Course>
  today: string
  selectedStatuses: ReadonlySet<AssignmentStatus>
  selectedTypes: ReadonlySet<AssignmentType>
  sortKey: SortKey
  sortAsc: boolean
  onToggleStatus: (status: AssignmentStatus) => void
  onToggleType: (type: AssignmentType) => void
  onToggleSort: (key: SortKey) => void
  onAddAssignment: () => void
  addRow?: ReactNode
}

export function AssignmentWorkspace({
  assignments,
  dueSoon,
  courseMap,
  today,
  selectedStatuses,
  selectedTypes,
  sortKey,
  sortAsc,
  onToggleStatus,
  onToggleType,
  onToggleSort,
  onAddAssignment,
  addRow,
  ...actions
}: AssignmentWorkspaceProps) {
  return (
    <section id="student-assignments" className="surface min-w-0 rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-3 sm:px-4">
        <div>
          <h2 className="text-base font-semibold">Assignments</h2>
          <p className="text-2xs text-muted-foreground">{assignments.length} shown</p>
        </div>
        <Button size="sm" onClick={onAddAssignment} className="min-h-11 sm:min-h-8"><Plus /> Add assignment</Button>
      </div>

      {dueSoon.length > 0 ? (
        <div className="border-b border-border/60 px-3 py-3 sm:px-4">
          <div className="mb-2 flex items-center gap-2">
            <CalendarDays className="size-4 text-warning" />
            <h3 className="text-sm font-semibold">Due soon</h3>
          </div>
          <div className="space-y-1">
            {dueSoon.slice(0, 5).map((assignment) => {
              const days = daysUntil(assignment.deadline!, today)
              return (
                <div key={assignment.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/35 px-2.5 py-2">
                  <button type="button" aria-label={`Open ${assignment.name}`} onClick={() => actions.onOpenAssignment(assignment)} className="min-w-40 flex-1 text-left">
                    <span className="block truncate text-xs font-semibold">{assignment.name}</span>
                    <span className="block text-2xs text-muted-foreground">{courseMap[assignment.courseId]?.name} · {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d`}</span>
                  </button>
                  <AssignmentStatusControl assignmentName={assignment.name} status={assignmentStatus(assignment)} onChange={(status) => actions.onStatusChange(assignment.id, status)} compact />
                  <label className="sr-only" htmlFor={`due-deadline-${assignment.id}`}>Edit deadline for {assignment.name}</label>
                  <input id={`due-deadline-${assignment.id}`} aria-label={`Edit deadline for ${assignment.name}`} type="date" value={assignment.deadline ?? ''} onChange={(event) => actions.onDeadlineChange(assignment.id, event.target.value || undefined)} className="min-h-9 rounded-lg border border-input bg-transparent px-2 font-mono text-2xs outline-none" />
                  <span className="hidden text-2xs text-muted-foreground md:inline">{fmtDate(assignment.deadline!)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="px-3 py-3 sm:px-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5" aria-label="Assignment status filters">
              {ASSIGNMENT_STATUSES.map((status) => (
                <Chip key={status} selectable selected={selectedStatuses.has(status)} onClick={() => onToggleStatus(status)}>{status}</Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Assignment type filters">
              {ASSIGNMENT_TYPES.map((type) => (
                <Chip key={type} selectable selected={selectedTypes.has(type)} onClick={() => onToggleType(type)}>{type}</Chip>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 text-2xs text-muted-foreground">
            <span>Sort</span>
            {(['deadline', 'name', 'grade'] as SortKey[]).map((key) => (
              <button key={key} type="button" aria-pressed={sortKey === key} onClick={() => onToggleSort(key)} className={`min-h-8 rounded-lg px-2 capitalize ${sortKey === key ? 'bg-accent/12 text-accent' : 'hover:bg-secondary'}`}>
                {key}{sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
              </button>
            ))}
          </div>
        </div>

        <h3 className="sr-only">All assignments</h3>
        {assignments.length === 0 && !addRow ? (
          <EmptyState message="No assignments match these filters." hint="Change a filter or add an assignment." />
        ) : (
          <>
            <AssignmentTable assignments={assignments} courseMap={courseMap} {...actions} />
            <AssignmentCardList assignments={assignments} courseMap={courseMap} {...actions} />
            {addRow}
          </>
        )}
      </div>
    </section>
  )
}
