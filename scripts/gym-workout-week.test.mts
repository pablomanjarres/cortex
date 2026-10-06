import assert from 'node:assert/strict'
import { test } from 'node:test'
import { workoutWeek } from '../src/features/gym/domain/workout-week.ts'
import type { WorkoutDay } from '../src/types/gym.ts'

const today = new Date(2026, 9, 6, 12)
const plan = (id: string, dayOfWeek: string): WorkoutDay => ({ id, name: id, dayOfWeek, time: '1:30 PM', exercises: [] })

test('the workout strip uses the current Monday-through-Sunday dates', () => {
  const week = workoutWeek([plan('upper', 'Monday'), plan('lower', 'Tuesday')], today)
  assert.deepEqual(week.map((day) => day.date), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
  assert.equal(week[1].plan?.id, 'lower')
  assert.equal(week[2].plan, null)
})

test('multiple plans scheduled for one weekday remain selectable', () => {
  const week = workoutWeek([plan('morning', ' Tuesday '), plan('evening', 'tuesday')], today)
  assert.deepEqual(week.filter((day) => day.date === '2026-10-06').map((day) => day.plan?.id), ['morning', 'evening'])
})

test('a custom schedule stays in the strip without an invented date', () => {
  const week = workoutWeek([plan('custom', 'When available')], today)
  assert.equal(week.length, 8)
  assert.deepEqual(week.at(-1), { date: null, weekday: 'When available', plan: plan('custom', 'When available') })
})
