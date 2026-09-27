import test from 'node:test'
import assert from 'node:assert/strict'

type CalendarModel = typeof import('../src/features/calendar/calendar-model.ts')

const loadModel = async (): Promise<CalendarModel> => import('../src/features/calendar/calendar-model.ts')

const eventKitAllDay = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return {
    startDate: new Date(year, month - 1, day, 0, 0, 0, 0).toISOString(),
    endDate: new Date(year, month - 1, day, 23, 59, 59, 999).toISOString(),
  }
}

const fixtureEvents = [
  {
    id: 'all-day',
    title: 'University holiday',
    startDate: '2026-09-21',
    endDate: '2026-09-22',
    calendar: 'Classes',
    isAllDay: true,
    notes: '',
    lastModified: '2026-09-19T10:00:00-05:00',
    recurrence: '',
  },
  {
    id: 'timed',
    title: 'Algorithms',
    startDate: '2026-09-21T10:00:00',
    endDate: '2026-09-21T11:15:00',
    calendar: 'EAFIT',
    isAllDay: false,
    notes: '',
    lastModified: '2026-09-19T10:00:00-05:00',
    recurrence: '',
  },
  {
    id: 'midnight',
    title: 'Deploy watch',
    startDate: '2026-09-21T23:30:00',
    endDate: '2026-09-22T00:30:00',
    calendar: 'Work',
    isAllDay: false,
    notes: '',
    lastModified: '2026-09-19T10:00:00-05:00',
    recurrence: '',
  },
]

test('groupCalendarDays separates all-day and timed events across local days without mutating input', async () => {
  const { groupCalendarDays } = await loadModel()
  const events = structuredClone(fixtureEvents)

  const groups = groupCalendarDays(events, ['2026-09-21', '2026-09-22', '2026-09-23'])

  assert.deepEqual(groups.map((day) => ({
    date: day.date,
    allDay: day.allDay.map((event) => event.id),
    timed: day.timed.map((event) => event.id),
  })), [
    { date: '2026-09-21', allDay: ['all-day'], timed: ['timed', 'midnight'] },
    { date: '2026-09-22', allDay: [], timed: ['midnight'] },
    { date: '2026-09-23', allDay: [], timed: [] },
  ])
  assert.deepEqual(events, fixtureEvents)
})

test('groupCalendarDays maps EventKit all-day ISO inclusive ends onto the local calendar day', async () => {
  const { groupCalendarDays } = await loadModel()
  const event = {
    id: 'eventkit-all-day',
    title: 'EventKit all-day',
    ...eventKitAllDay('2026-09-21'),
    calendar: 'Calendar',
    isAllDay: true,
    notes: '',
    lastModified: '2026-09-19T10:00:00Z',
    recurrence: '',
  }

  const groups = groupCalendarDays([event], ['2026-09-20', '2026-09-21', '2026-09-22'])

  assert.deepEqual(groups.map((day) => ({
    date: day.date,
    allDay: day.allDay.map((item) => item.id),
  })), [
    { date: '2026-09-20', allDay: [] },
    { date: '2026-09-21', allDay: ['eventkit-all-day'] },
    { date: '2026-09-22', allDay: [] },
  ])
})
