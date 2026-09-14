import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateLegacyHabitHistory } from '../src/features/habits/habit-migration.ts'

const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']
const grid = { workout: { Mon: true, Tue: false, Sun: true, unknown: true } }

test('migration waits for persisted history and preserves existing entries', async () => {
  let resolveHistory
  const history = new Promise((resolve) => { resolveHistory = resolve })
  const updates = []
  const pending = migrateLegacyHabitHistory(grid, week, () => history, (update) => updates.push(update))
  assert.equal(updates.length, 0, 'must not save before persisted history loads')
  resolveHistory({ '2026-08-31': { reading: true } })
  await pending
  assert.equal(updates.length, 0, 'existing date-based history must stay intact')
})

test('legacy completions migrate once to the viewed calendar week', async () => {
  const updates = []
  await migrateLegacyHabitHistory(grid, week, async () => ({}), (update) => updates.push(update))
  assert.equal(updates.length, 1)
  const migrated = updates[0]({})
  assert.deepEqual(migrated, { '2026-09-14': { workout: true }, '2026-09-20': { workout: true } })
  assert.equal(updates[0](migrated), migrated, 'replaying the reducer must preserve migrated history')
})

test('a user completion written during migration wins over the legacy grid', async () => {
  const updates = []
  await migrateLegacyHabitHistory(grid, week, async () => ({}), (update) => updates.push(update))
  const newerHistory = { '2026-09-16': { reading: true } }
  assert.equal(updates[0](newerHistory), newerHistory)
})

test('unchecked or unrecognized legacy weekdays produce no save', async () => {
  const updates = []
  await migrateLegacyHabitHistory({ workout: { Mon: false, unknown: true } }, week, async () => ({}), (update) => updates.push(update))
  assert.deepEqual(updates, [])
})
