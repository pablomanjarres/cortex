import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ICONS } from './course-icons'
import type { Course } from './student-types'

export interface CourseSummary {
  openCount: number
  grade?: number
}

interface CourseSelectorProps {
  courses: Course[]
  selectedCourseId: string | null
  courseSummaries: Record<string, CourseSummary>
  onSelectCourse: (courseId: string | null) => void
  onAddCourse: () => void
}

function CourseButton({ course, selected, summary, onClick, compact = false }: {
  course: Course
  selected: boolean
  summary?: CourseSummary
  onClick: () => void
  compact?: boolean
}) {
  const Icon = ICONS[course.iconKey]
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`group flex min-h-11 gap-2 rounded-xl border text-left transition-colors ${
        compact ? 'w-52 shrink-0 items-center px-3 py-2' : 'w-full items-start px-3 py-3'
      } ${selected ? 'border-accent/50 bg-accent/12' : 'border-transparent hover:border-border hover:bg-secondary/45'}`}
    >
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-accent" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{course.name}</span>
        <span className="mt-0.5 block text-2xs text-muted-foreground">
          {summary?.openCount ?? 0} open{summary?.grade !== undefined ? ` · ${summary.grade.toFixed(1)}` : ''}
        </span>
      </span>
    </button>
  )
}

export function CourseSelector({ courses, selectedCourseId, courseSummaries, onSelectCourse, onAddCourse }: CourseSelectorProps) {
  return (
    <>
      <aside className="surface hidden w-56 shrink-0 rounded-2xl p-2 lg:block" aria-label="Courses">
        <button
          type="button"
          aria-pressed={selectedCourseId === null}
          onClick={() => onSelectCourse(null)}
          className={`min-h-11 w-full rounded-xl px-3 text-left text-xs font-semibold transition-colors ${selectedCourseId === null ? 'bg-accent/12 text-accent' : 'text-muted-foreground hover:bg-secondary/45 hover:text-foreground'}`}
        >
          All courses
        </button>
        <div className="mt-1 space-y-1">
          {courses.map((course) => (
            <CourseButton key={course.id} course={course} selected={selectedCourseId === course.id} summary={courseSummaries[course.id]} onClick={() => onSelectCourse(course.id)} />
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={onAddCourse} className="mt-2 w-full justify-start">
          <Plus /> Add course
        </Button>
      </aside>

      <div className="surface hidden gap-2 overflow-x-auto rounded-2xl p-2 sm:flex lg:hidden" aria-label="Courses">
        <button
          type="button"
          aria-pressed={selectedCourseId === null}
          onClick={() => onSelectCourse(null)}
          className={`min-h-11 w-32 shrink-0 rounded-xl px-3 text-left text-xs font-semibold ${selectedCourseId === null ? 'bg-accent/12 text-accent' : 'text-muted-foreground'}`}
        >
          All courses
        </button>
        {courses.map((course) => (
          <CourseButton key={course.id} course={course} selected={selectedCourseId === course.id} summary={courseSummaries[course.id]} onClick={() => onSelectCourse(course.id)} compact />
        ))}
        <Button variant="ghost" size="sm" onClick={onAddCourse} className="min-h-11 shrink-0 self-center">
          <Plus /> Add course
        </Button>
      </div>

      <div className="surface flex items-end gap-2 rounded-2xl p-3 sm:hidden">
        <label className="min-w-0 flex-1 text-2xs text-muted-foreground">
          Course
          <select
            aria-label="Course"
            value={selectedCourseId ?? ''}
            onChange={(event) => onSelectCourse(event.target.value || null)}
            className="mt-1 min-h-11 w-full rounded-xl border border-input bg-input/20 px-3 text-sm text-foreground outline-none"
          >
            <option value="">All courses</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
        </label>
        <Button variant="secondary" size="icon" onClick={onAddCourse} aria-label="Add course" className="min-h-11 min-w-11">
          <Plus />
        </Button>
      </div>
    </>
  )
}
