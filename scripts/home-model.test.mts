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

test('open assignment count includes overdue and undated work but not completed work', async () => {
  const { countOpenAssignments } = await loadModel()
  assert.equal(countOpenAssignments([
    assignment({ id: 'overdue', deadline: '2026-09-01' }),
    assignment({ id: 'undated', deadline: undefined }),
    assignment({ id: 'done', deadline: '2026-09-30', done: true }),
  ]), 2)
})

test('live sprint sessions replace only the current day in the week map', async () => {
  const { withLiveDaySessions } = await loadModel()
  const earlier = [{ id: 'earlier', task: 'Earlier', duration: 25, startedAt: '2026-09-18T10:00:00', completedAt: '2026-09-18T10:25:00' }]
  const live = [{ id: 'live', task: 'Now', duration: 45, startedAt: '2026-09-19T10:00:00', completedAt: '2026-09-19T10:45:00' }]
  const stored = { '2026-09-18': earlier, '2026-09-19': [] }
  const result = withLiveDaySessions(stored, '2026-09-19', live)
  assert.deepEqual(result, { '2026-09-18': earlier, '2026-09-19': live })
  assert.deepEqual(stored['2026-09-19'], [])
})

test('synced assignment calendar copies do not duplicate Home source items', async () => {
  const { independentCalendarEvents } = await loadModel()
  const event = (id: string, notes: string) => ({
    id, notes, title: id, startDate: '2026-09-19', endDate: '2026-09-20', calendar: 'Calendar', isAllDay: true,
  })
  const result = independentCalendarEvents([
    event('synced', 'cortex:assignment:a'),
    event('meeting', ''),
    event('orphan', 'cortex:assignment:removed'),
  ], [assignment({ id: 'a', deadline: '2026-09-19' })])
  assert.deepEqual(result.map((item) => item.id), ['meeting', 'orphan'])
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

  const result = upcomingAssignments(assignments, new Date(2026, 8, 19, 23, 59))

  assert.deepEqual(result.map((item) => item.id), ['today', 'same-a', 'same-b', 'later'])
  assert.deepEqual(assignments.map((item) => item.id), originalOrder)
})

test('overdueAssignments returns only open past-deadline assignments in age order', async () => {
  const { overdueAssignments } = await loadModel()
  const result = overdueAssignments([
    assignment({ id: 'future', deadline: '2026-09-20' }),
    assignment({ id: 'oldest', deadline: '2026-09-10' }),
    assignment({ id: 'done-past', deadline: '2026-09-18', done: true }),
    assignment({ id: 'recent', deadline: '2026-09-18' }),
    assignment({ id: 'bad', deadline: 'September 18' }),
  ], new Date('2026-09-19T08:00:00-05:00'))

  assert.deepEqual(result.map((item) => item.id), ['oldest', 'recent'])
})

test('upNextItems merges future calendar events and open deadlines by actual time', async () => {
  const { upNextItems } = await loadModel()
  const result = upNextItems({
    events: [
      {
        id: 'late-call',
        title: 'Late call',
        startDate: '2026-09-19T20:00:00',
        endDate: '2026-09-19T21:00:00',
        calendar: 'Work',
        isAllDay: false,
      },
      {
        id: 'past-event',
        title: 'Already happened',
        startDate: '2026-09-19T07:00:00',
        endDate: '2026-09-19T08:00:00',
        calendar: 'Work',
        isAllDay: false,
      },
    ],
    assignments: [
      assignment({ id: 'tomorrow', name: 'Tomorrow assignment', courseId: 'cs', deadline: '2026-09-20' }),
      assignment({ id: 'today', name: 'Today assignment', courseId: 'math', deadline: '2026-09-19' }),
      assignment({ id: 'done', deadline: '2026-09-19', done: true }),
    ],
    courseNames: new Map([['cs', 'Computer Science'], ['math', 'Math']]),
    now: new Date(2026, 8, 19, 8),
  })

  assert.deepEqual(result.map((item) => `${item.kind}:${item.id}`), [
    'event:late-call',
    'deadline:today',
    'deadline:tomorrow',
  ])
  assert.deepEqual(result.map((item) => item.source), ['Work', 'Math', 'Computer Science'])
})

test('upNextItems keeps ongoing timed events and current all-day events visible', async () => {
  const { upNextItems } = await loadModel()
  const result = upNextItems({
    events: [
      {
        id: 'all-day',
        title: 'Conference',
        startDate: '2026-09-19',
        endDate: '2026-09-20',
        calendar: 'Personal',
        isAllDay: true,
      },
      {
        id: 'ongoing',
        title: 'Studio block',
        startDate: '2026-09-19T07:00:00-05:00',
        endDate: '2026-09-19T09:00:00-05:00',
        calendar: 'Work',
        isAllDay: false,
      },
      {
        id: 'ended',
        title: 'Earlier',
        startDate: '2026-09-19T06:00:00-05:00',
        endDate: '2026-09-19T07:00:00-05:00',
        calendar: 'Work',
        isAllDay: false,
      },
    ],
    assignments: [],
    courseNames: new Map(),
    now: new Date('2026-09-19T08:00:00-05:00'),
  })

  assert.deepEqual(result.map((item) => item.id), ['all-day', 'ongoing'])
})
