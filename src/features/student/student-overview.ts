import { getWeekDates } from '@/lib/date-utils'
import type { Assignment, Course } from './student-types'

export interface StudentOverview {
  courseCount: number
  openCount: number
  dueThisWeek: number
  overdueCount: number
  priorityAssignment?: Assignment
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
  const open = assignments.filter((assignment) => activeIds.has(assignment.courseId) && !assignment.done)
  const [weekStart, , , , , , weekEnd] = getWeekDates(today)
  const dated = open.filter((assignment) => assignment.deadline && /^\d{4}-\d{2}-\d{2}$/.test(assignment.deadline))
  const priorityAssignment = [...dated].sort((a, b) =>
    a.deadline!.localeCompare(b.deadline!) || a.id.localeCompare(b.id),
  )[0]

  return {
    courseCount: activeCourses.length,
    openCount: open.length,
    dueThisWeek: dated.filter((assignment) => assignment.deadline! >= weekStart && assignment.deadline! <= weekEnd).length,
    overdueCount: dated.filter((assignment) => assignment.deadline! < today).length,
    priorityAssignment,
  }
}
