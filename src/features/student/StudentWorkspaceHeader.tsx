import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AssignmentStatus } from './student-overview'

interface StudentWorkspaceHeaderProps {
  semesters: string[]
  activeSemester: string
  openCount: number
  awaitingGradeCount: number
  currentAverage?: number
  onChangeSemester: (semester: string) => void
  onAddSemester: () => void
  onAddAssignment: () => void
  onStatusFilter: (status: AssignmentStatus) => void
}

export function StudentWorkspaceHeader({
  semesters,
  activeSemester,
  openCount,
  awaitingGradeCount,
  currentAverage,
  onChangeSemester,
  onAddSemester,
  onAddAssignment,
  onStatusFilter,
}: StudentWorkspaceHeaderProps) {
  return (
    <section className="surface flex flex-col gap-3 rounded-2xl p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto" aria-label="Semesters">
          {semesters.map((semester) => (
            <button
              key={semester}
              type="button"
              aria-pressed={semester === activeSemester}
              onClick={() => onChangeSemester(semester)}
              className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors ${
                semester === activeSemester
                  ? 'border-accent/45 bg-accent/12 text-accent'
                  : 'border-border text-muted-foreground hover:border-input hover:text-foreground'
              }`}
            >
              {semester}
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={onAddSemester} className="shrink-0">
            <Plus /> Semester
          </Button>
        </div>
        <Button size="sm" onClick={onAddAssignment} className="min-h-11 shrink-0 sm:min-h-9">
          <Plus /> Add assignment
        </Button>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border/60 rounded-xl bg-secondary/35">
        <button type="button" onClick={() => onStatusFilter('Open')} className="min-h-14 px-3 py-2 text-left sm:min-h-12">
          <span className="block text-2xs text-muted-foreground">Open</span>
          <span className="font-mono text-lg font-semibold tabular-nums">{openCount}</span>
        </button>
        <button type="button" onClick={() => onStatusFilter('Awaiting grade')} className="min-h-14 px-3 py-2 text-left sm:min-h-12">
          <span className="block text-2xs text-muted-foreground">Awaiting grade</span>
          <span className="font-mono text-lg font-semibold tabular-nums text-accent">{awaitingGradeCount}</span>
        </button>
        <div className="min-h-14 px-3 py-2 sm:min-h-12">
          <span className="block text-2xs text-muted-foreground">Current average</span>
          <span className="font-mono text-lg font-semibold tabular-nums text-success">{currentAverage?.toFixed(1) ?? '—'}</span>
        </div>
      </div>
    </section>
  )
}
