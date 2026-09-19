import test from 'node:test'
import assert from 'node:assert/strict'
import type { SprintSession } from '../src/lib/sprint-context.tsx'
import type { Assignment } from '../src/features/student/student-types.ts'

type HomeModel = typeof import('../src/features/daily/home-model.ts')

const loadModel = async (): Promise<HomeModel> => import('../src/features/daily/home-model.ts')

const assignment = (overrides: Partial<Assignment>): Assignment => ({
  id: 'a',
  name: 'Assignment',
  courseId: 'course',
  type: 'Project',
  weight: 0.2,
  done: false,
  priority: 'Medium',
  ...overrides,
})

test('weekDates returns the local Monday through Sunday around the anchor', async () => {
  const { weekDates } = await loadModel()

  assert.deepEqual(weekDates(new Date('2026-09-17T15:30:00-05:00')), [
    '2026-09-14',
    '2026-09-15',
    '2026-09-16',
    '2026-09-17',
    '2026-09-18',
    '2026-09-19',
    '2026-09-20',
  ])
})

test('weeklyFocusMinutes sums sessions by stored day including cross-midnight start day', async () => {
  const { weeklyFocusMinutes } = await loadModel()
  const mondaySession: SprintSession = {
    id: 'late',
    task: 'Late focus',
    duration: 25,
    startedAt: '2026-09-14T23:50:00-05:00',
    completedAt: '2026-09-15T00:15:00-05:00',
  }
  const tuesdaySession: SprintSession = {
    id: 'morning',
    task: 'Morning focus',
    duration: 10,
    startedAt: '2026-09-15T09:00:00-05:00',
    completedAt: '2026-09-15T09:10:00-05:00',
  }

  assert.deepEqual(weeklyFocusMinutes(
    ['2026-09-14', '2026-09-15', '2026-09-16'],
    { '2026-09-14': [mondaySession], '2026-09-15': [tuesdaySession] },
  ), [25, 10, 0])
})

test('activeHabitSummary excludes held habits from completion and total counts', async () => {
  const { activeHabitSummary } = await loadModel()

  assert.deepEqual(activeHabitSummary(
    [{ id: 'read' }, { id: 'lift', onHold: true }, { id: 'ship' }],
    { read: true, lift: true, ship: false, stray: true },
  ), { done: 1, total: 2 })
})

test('upcomingAssignments keeps open valid deadlines from today onward without mutating inputs', async () => {
  const { upcomingAssignments } = await loadModel()
  const assignments = [
    assignment({ id: 'later', name: 'Later', deadline: '2026-09-21' }),
    assignment({ id: 'same-a', name: 'Same A', deadline: '2026-09-20' }),
    assignment({ id: 'done', name: 'Done', deadline: '2026-09-19', done: true }),
    assignment({ id: 'bad', name: 'Bad', deadline: 'not-a-date' }),
    assignment({ id: 'today', name: 'Today', deadline: '2026-09-19' }),
    assignment({ id: 'same-b', name: 'Same B', deadline: '2026-09-20' }),
    assignment({ id: 'past', name: 'Past', deadline: '2026-09-18' }),
    assignment({ id: 'missing', name: 'Missing', deadline: undefined }),
  ]
  const originalOrder = assignments.map((item) => item.id)

  const result = upcomingAssignments(assignments, new Date('2026-09-19T23:59:00-05:00'))

  assert.deepEqual(result.map((item) => item.id), ['today', 'same-a', 'same-b', 'later'])
  assert.deepEqual(assignments.map((item) => item.id), originalOrder)
})
