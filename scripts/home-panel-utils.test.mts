import test from 'node:test'
import assert from 'node:assert/strict'
import type { HomeCalendarEvent } from '../src/features/daily/home-model.ts'

type HomePanelUtils = typeof import('../src/features/daily/components/homePanelUtils.tsx')

const loadUtils = async (): Promise<HomePanelUtils> => import('../src/features/daily/components/homePanelUtils.tsx')

const event = (overrides: Partial<HomeCalendarEvent>): HomeCalendarEvent => ({
  id: 'event',
  title: 'Event',
  startDate: '2026-09-19T09:00:00-05:00',
  endDate: '2026-09-19T10:00:00-05:00',
  calendar: 'Calendar',
  isAllDay: false,
  ...overrides,
})

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

test('homeCalendarState treats empty Electron reads as ambiguous but preserves browser empty semantics', async () => {
  const { homeCalendarState } = await loadUtils()

  assert.equal(homeCalendarState(false, null, [], 'electron'), 'ambiguous')
  assert.equal(homeCalendarState(false, null, [], 'http'), 'empty')
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
