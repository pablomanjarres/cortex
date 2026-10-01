import { ASSIGNMENT_STATUSES, type AssignmentStatus } from './student-overview'

interface AssignmentStatusControlProps {
  assignmentName: string
  status: AssignmentStatus
  onChange: (status: AssignmentStatus) => void
  compact?: boolean
}

const statusClass: Record<AssignmentStatus, string> = {
  Open: 'border-input text-foreground',
  'Awaiting grade': 'border-accent/45 bg-accent/10 text-accent',
  Graded: 'border-success/35 bg-success/10 text-success',
}

export function AssignmentStatusControl({ assignmentName, status, onChange, compact = false }: AssignmentStatusControlProps) {
  return (
    <select
      aria-label={`Status for ${assignmentName}`}
      value={status}
      onChange={(event) => onChange(event.target.value as AssignmentStatus)}
      className={`cursor-pointer rounded-full border bg-card px-2 outline-none transition-colors ${statusClass[status]} ${
        compact ? 'h-7 text-2xs sm:h-7' : 'min-h-11 text-xs sm:min-h-8'
      }`}
    >
      {ASSIGNMENT_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  )
}
