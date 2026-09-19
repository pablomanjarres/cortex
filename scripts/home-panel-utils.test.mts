import test from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HomeCalendarEvent } from '../src/features/daily/home-model.ts'
import type { Assignment } from '../src/features/student/student-types.ts'

type HomePanelUtils = typeof import('../src/features/daily/components/homePanelUtils.tsx')

const loadUtils = async (): Promise<HomePanelUtils> => import('../src/features/daily/components/homePanelUtils.tsx')

// The default tsx test command transpiles TSX with the classic JSX transform.
Object.assign(globalThis, { React })

const event = (overrides: Partial<HomeCalendarEvent>): HomeCalendarEvent => ({
  id: 'event',
  title: 'Event',
  startDate: '2026-09-19T09:00:00-05:00',
  endDate: '2026-09-19T10:00:00-05:00',
  calendar: 'Calendar',
  isAllDay: false,
  ...overrides,
})

const assignment = (id: string, deadline?: string, done = false): Assignment => ({
  id,
  name: id,
  courseId: 'course',
  type: 'Project',
  weight: 10,
  deadline,
  done,
  priority: 'Medium',
})

const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']

test('eventOverlapsDay includes overnight events on every overlapping local day', async () => {
  const { eventOverlapsDay } = await loadUtils()
  const overnight = event({
    id: 'overnight',
    startDate: '2026-09-19T23:30:00',
    endDate: '2026-09-20T01:30:00',
  })

  assert.equal(eventOverlapsDay(overnight, '2026-09-19'), true)
  assert.equal(eventOverlapsDay(overnight, '2026-09-20'), true)
  assert.equal(eventOverlapsDay(overnight, '2026-09-21'), false)
})

test('eventOverlapsDay respects all-day exclusive end dates', async () => {
  const { eventOverlapsDay } = await loadUtils()
  const allDay = event({
    id: 'retreat',
    startDate: '2026-09-19',
    endDate: '2026-09-21',
    isAllDay: true,
  })

  assert.equal(eventOverlapsDay(allDay, '2026-09-18'), false)
  assert.equal(eventOverlapsDay(allDay, '2026-09-19'), true)
  assert.equal(eventOverlapsDay(allDay, '2026-09-20'), true)
  assert.equal(eventOverlapsDay(allDay, '2026-09-21'), false)
})

test('homeCalendarState treats empty range reads as ambiguous until the backend reports explicit success', async () => {
  const { homeCalendarState } = await loadUtils()

  assert.equal(homeCalendarState(false, null, [], 'electron'), 'ambiguous')
  assert.equal(homeCalendarState(false, null, [], 'http'), 'ambiguous')
})

test('schedule fact describes the Monday-to-Sunday range actually queried', async () => {
  const { calendarDetailForState } = await loadUtils()
  assert.equal(calendarDetailForState('ready'), 'Events this week')
  assert.equal(calendarDetailForState('loading'), 'Loading this week')
})

test('date-only student deadlines never display an invented time', async () => {
  const { dueDateLabel } = await loadUtils()
  assert.equal(dueDateLabel('2026-09-19'), 'Due Sep 19')
})

test('Home facts render four real-data microcharts rather than empty card space', async () => {
  const { buildFacts } = await loadUtils()
  const { FactGrid } = await import('../src/features/daily/components/HomeFacts.tsx')
  const assignments = [
    assignment('late', '2026-09-18'),
    assignment('today', '2026-09-19'),
    assignment('sunday', '2026-09-20'),
    assignment('later', '2026-09-21'),
    assignment('undated'),
    assignment('completed', '2026-09-19', true),
  ]
  const calendarEvents = [event({
    id: 'overnight',
    startDate: '2026-09-19T23:30:00',
    endDate: '2026-09-20T01:30:00',
  })]

  const input = {
    focusMinutes: 0,
    focusWeekMinutes: [0, 30, 0, 0, 0, 0, 0],
    weekDays: week,
    today: '2026-09-19',
    habitsDone: 3,
    habitsTotal: 4,
    openAssignments: 5,
    assignments,
    calendarState: 'ready' as const,
    eventCount: 1,
    calendarEvents,
  }
  const markup = renderToStaticMarkup(createElement(FactGrid, { facts: buildFacts(input) }))

  assert.match(markup, /role="img" aria-label="Deep work this week: Mon 0m, Tue 30m/)
  assert.match(markup, /role="img" aria-label="3 of 4 habits completed today"/)
  assert.match(markup, /role="img" aria-label="Open assignments: 1 overdue, 2 due this week, 1 later, 1 without date"/)
  assert.match(markup, /role="img" aria-label="Events this week: Mon 0, Tue 0, Wed 0, Thu 0, Fri 0, Sat 1, Sun 1"/)
})

test('Schedule shows no event chart when its Calendar read failed', async () => {
  const { buildFacts } = await loadUtils()
  const { FactGrid } = await import('../src/features/daily/components/HomeFacts.tsx')
  const input = {
    focusMinutes: 0,
    focusWeekMinutes: Array(7).fill(0) as number[],
    weekDays: week,
    today: '2026-09-19',
    habitsDone: 0,
    habitsTotal: 0,
    openAssignments: 0,
    assignments: [] as Assignment[],
    calendarState: 'error' as const,
    eventCount: 1,
    calendarEvents: [event({})],
  }
  const markup = renderToStaticMarkup(createElement(FactGrid, { facts: buildFacts(input) }))

  assert.doesNotMatch(markup, /role="img" aria-label="Events this week:/)
  assert.match(markup, /Calendar chart unavailable/)
})

test('buildShortcutHabits excludes held habits from toggle shortcuts', async () => {
  const { buildShortcutHabits } = await loadUtils()
  const toggled: string[] = []
  const habits = [
    { id: 'read', name: 'Read', emoji: '📖' },
    { id: 'lift', name: 'Lift', emoji: '💪', onHold: true },
    { id: 'ship', name: 'Ship', emoji: '🚢' },
  ]

  const chips = buildShortcutHabits(
    habits,
    (id: string) => id === 'read',
    (id: string) => { toggled.push(id) },
  )

  assert.deepEqual(chips.map((habit: { id: string }) => habit.id), ['read', 'ship'])
  assert.equal(chips[0].done, true)
  chips[1].onToggle()
  assert.deepEqual(toggled, ['ship'])
})
