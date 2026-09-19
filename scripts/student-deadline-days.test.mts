import assert from 'node:assert/strict'
import test from 'node:test'
import { daysUntil } from '../src/features/student/student-types.ts'

test('student deadline countdown uses calendar dates, not UTC midnight instants', () => {
  assert.equal(daysUntil('2026-09-20', '2026-09-20'), 0)
  assert.equal(daysUntil('2026-09-19', '2026-09-20'), -1)
  assert.equal(daysUntil('2026-10-01', '2026-09-30'), 1)
})
