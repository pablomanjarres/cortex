import assert from 'node:assert/strict'
import test from 'node:test'
import type { Assignment, Course } from '../src/features/student/student-types.ts'
const overview = await import('../src/features/student/student-overview.ts').catch(() => ({} as {
  studentOverview?: (...args: unknown[]) => {
    courseCount: number; openCount: number; dueThisWeek: number; overdueCount: number; priorityAssignment?: Assignment
  }
}))

const courses: Course[] = [
  { id: 'active', name: 'Algorithms', semester: 'Fall', difficulty: 'Medium', iconKey: 'book', status: 'Normal', credits: 3 },
  { id: 'old', name: 'History', semester: 'Spring', difficulty: 'Easy', iconKey: 'book', status: 'Normal', credits: 2 },
]
const assignment = (id: string, courseId: string, deadline?: string, done = false): Assignment => ({
  id, courseId, name: id, deadline, done, type: 'Lab', weight: 0.2, priority: 'Medium',
})

test('student overview counts only active open work and leads with overdue work', () => {
  const result = overview.studentOverview?.(courses, [
    assignment('overdue', 'active', '2026-09-18'),
    assignment('sunday', 'active', '2026-09-20'),
    assignment('undated', 'active'),
    assignment('done', 'active', '2026-09-19', true),
    assignment('other-term', 'old', '2026-09-19'),
  ], 'Fall', '2026-09-19')
  assert.deepEqual(result && {
    courseCount: result.courseCount,
    openCount: result.openCount,
    dueThisWeek: result.dueThisWeek,
    overdueCount: result.overdueCount,
    priorityId: result.priorityAssignment?.id,
    deadlineQueueIds: result.deadlineQueue?.map((item) => item.id),
  }, { courseCount: 1, openCount: 3, dueThisWeek: 2, overdueCount: 1, priorityId: 'overdue', deadlineQueueIds: ['overdue', 'sunday'] })
})

test('student overview leaves an empty semester genuinely empty', () => {
  const result = overview.studentOverview?.(courses, [assignment('old-work', 'old', '2026-09-19')], 'New', '2026-09-19')
  assert.deepEqual(result && { courseCount: result.courseCount, openCount: result.openCount, priority: result.priorityAssignment },
    { courseCount: 0, openCount: 0, priority: undefined })
})

test('opening priority work keeps its type in the active filter', () => {
  const include = (overview as typeof overview & { includeAssignmentType?: (selected: ReadonlySet<string>, type: string) => Set<string> }).includeAssignmentType
  assert.deepEqual([...(include?.(new Set(['Exam']), 'Lab') ?? [])].sort(), ['Exam', 'Lab'])
})
