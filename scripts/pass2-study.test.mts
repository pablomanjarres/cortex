import assert from 'node:assert/strict'
import test from 'node:test'
import type { Assignment, Course } from '../src/features/student/student-types.ts'
import { newStudyNote } from '../src/features/student/student-types.ts'
import { courseGrades, semesterGpa } from '../src/features/student/student-grades.ts'
import { termCourses } from '../src/features/student/student-overview.ts'
import { applyGoalDraft, createGoal, goalDraft, groupGoals, type Goal } from '../src/features/goals/goal-model.ts'

const course = (id: string, semester: string, credits = 3): Course =>
  ({ id, name: id, semester, credits, difficulty: 'Medium', iconKey: 'book', status: 'Normal' })
const work = (courseId: string, weight: number, grade?: number): Assignment =>
  ({ id: `${courseId}-${weight}`, courseId, name: 'work', type: 'Exam', weight, grade, done: grade !== undefined, priority: 'Medium' })

test('course grades weigh only graded work and bound the final grade', () => {
  const grades = courseGrades([work('calc', 0.25, 4), work('calc', 0.25, 2), work('calc', 0.5), work('other', 1, 1)], 'calc')
  assert.equal(grades.current, 3)
  assert.equal(grades.best, 4)
  assert.equal(grades.worst, 1.5)
  assert.equal(grades.gradedShare, 0.5)
})

test('a course without weighted work reports no grade and a perfect ceiling', () => {
  assert.deepEqual(courseGrades([], 'calc'), { totalWeight: 0, gradedWeight: 0, current: undefined, best: 5, worst: 0, gradedShare: 0 })
})

test('semester GPA weighs courses by credits and skips ungraded ones for the current value', () => {
  const assignments = [work('calc', 1, 4), work('phys', 1, 2), work('hist', 1)]
  const gpa = semesterGpa([course('calc', 'T', 3), course('phys', 'T', 1), course('hist', 'T', 4)], (id) => courseGrades(assignments, id))
  assert.equal(gpa.current, 3.5)
  assert.equal(gpa.best, (4 * 3 + 2 + 5 * 4) / 8)
  assert.deepEqual(semesterGpa([], (id) => courseGrades(assignments, id)), { current: undefined, best: 5 })
})

test('term courses fall back to every course when the term has none', () => {
  const all = [course('a', 'Fall'), course('b', 'Spring')]
  assert.deepEqual(termCourses(all, 'Fall').map((c) => c.id), ['a'])
  assert.deepEqual(termCourses(all, 'Summer').map((c) => c.id), ['a', 'b'])
})

test('app notes snapshot the course name and default to unpinned, untagged', () => {
  const note = newStudyNote('Chain rule', course('calc', 'T'))
  assert.equal(note.courseId, 'calc')
  assert.equal(note.courseName, 'calc')
  assert.equal(note.source, 'manual')
  assert.deepEqual([note.tags, note.pinned], [[], false])
  const general = newStudyNote('Sleep', undefined, { tags: ['habit'], pinned: true })
  assert.equal('courseId' in general, false)
  assert.deepEqual([general.tags, general.pinned], [['habit'], true])
})

const goal = (patch: Partial<Goal>): Goal => ({ id: 'g', title: 'Goal', status: 'active', createdAt: '2026-01-01T00:00:00Z', ...patch })

test('new goals need a title and drop blank optional fields', () => {
  assert.equal(createGoal({ title: '  ', area: '', period: '', targetDate: '' }), null)
  const created = createGoal({ title: ' Run ', area: ' Health ', period: '', targetDate: '2026-12-01' })
  assert.deepEqual(created && { title: created.title, area: created.area, period: 'period' in created, targetDate: created.targetDate, progress: created.progress },
    { title: 'Run', area: 'Health', period: false, targetDate: '2026-12-01', progress: 0 })
})

test('saving a goal draft keeps completion time in step with status and clamps manual progress', () => {
  const now = new Date('2026-10-23T10:00:00Z')
  const done = applyGoalDraft(goal({}), { ...goalDraft(goal({})), status: 'done', progress: '140', area: '  ' }, now)
  assert.equal(done.completedAt, now.toISOString())
  assert.equal(done.progress, 100)
  assert.equal(done.area, undefined)
  const kept = applyGoalDraft(done, goalDraft(done), new Date('2027-01-01T00:00:00Z'))
  assert.equal(kept.completedAt, now.toISOString())
  assert.equal(applyGoalDraft(done, { ...goalDraft(done), status: 'active' }).completedAt, undefined)
  const withSteps = goal({ progress: 30, milestones: [{ id: 'm', title: 'Step', done: true }] })
  assert.equal(applyGoalDraft(withSteps, { ...goalDraft(withSteps), progress: '90' }).progress, 30)
})

test('goal groups sort labels alphabetically with the empty bucket last and overdue goals first', () => {
  const goals = [
    goal({ id: 'none', createdAt: '2026-03-01T00:00:00Z' }),
    goal({ id: 'late', area: 'Work', targetDate: '2026-01-01' }),
    goal({ id: 'soon', area: 'Work', targetDate: '2026-11-01' }),
    goal({ id: 'health', area: 'Health' }),
  ]
  assert.deepEqual(groupGoals(goals, 'area', '2026-10-23').map(([label, gs]) => [label, gs.map((g) => g.id)]), [
    ['Health', ['health']], ['Work', ['late', 'soon']], ['Uncategorized', ['none']],
  ])
  assert.deepEqual(groupGoals(goals, 'deadline', '2026-10-23')[0][1].map((g) => g.id), ['late', 'soon', 'none', 'health'])
})
