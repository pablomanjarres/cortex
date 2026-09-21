import { getWeekDates } from '@/lib/date-utils'
import type { Assignment, AssignmentType, Course } from './student-types'

export const ASSIGNMENT_STATUSES = ['Open', 'Awaiting grade', 'Graded'] as const
export type AssignmentStatus = typeof ASSIGNMENT_STATUSES[number]

export interface StudentOverview {
  courseCount: number
  openCount: number
  awaitingGradeCount: number
  dueThisWeek: number
  overdueCount: number
  priorityAssignment?: Assignment
  deadlineQueue: Assignment[]
}

/** Keep the priority row visible when navigating from the hero. */
export function includeAssignmentType(selected: ReadonlySet<AssignmentType>, type: AssignmentType): Set<AssignmentType> {
  return new Set([...selected, type])
}

export function assignmentStatus(assignment: Assignment): AssignmentStatus {
  if (assignment.grade !== undefined) return 'Graded'
  return assignment.done ? 'Awaiting grade' : 'Open'
}

export function filterAssignmentsByStatus(
  assignments: ReadonlyArray<Assignment>,
  statuses: ReadonlySet<AssignmentStatus>,
): Assignment[] {
  return assignments.filter((assignment) => statuses.has(assignmentStatus(assignment)))
}

/** Facts for the selected semester only; no example records or target percentages. */
export function studentOverview(
  courses: ReadonlyArray<Course>,
  assignments: ReadonlyArray<Assignment>,
  semester: string,
  today: string,
): StudentOverview {
  const activeCourses = courses.filter((course) => course.semester === semester)
  const activeIds = new Set(activeCourses.map((course) => course.id))
  const activeAssignments = assignments.filter((assignment) => activeIds.has(assignment.courseId))
  const open = activeAssignments.filter((assignment) => assignmentStatus(assignment) === 'Open')
  const awaitingGrade = activeAssignments.filter((assignment) => assignmentStatus(assignment) === 'Awaiting grade')
  const [weekStart, , , , , , weekEnd] = getWeekDates(today)
  const dated = open.filter((assignment) => assignment.deadline && /^\d{4}-\d{2}-\d{2}$/.test(assignment.deadline))
  const deadlineQueue = [...dated].sort((a, b) =>
    a.deadline!.localeCompare(b.deadline!) || a.id.localeCompare(b.id),
  )

  return {
    courseCount: activeCourses.length,
    openCount: open.length,
    awaitingGradeCount: awaitingGrade.length,
    dueThisWeek: dated.filter((assignment) => assignment.deadline! >= weekStart && assignment.deadline! <= weekEnd).length,
    overdueCount: dated.filter((assignment) => assignment.deadline! < today).length,
    priorityAssignment: deadlineQueue[0],
    deadlineQueue,
  }
}
