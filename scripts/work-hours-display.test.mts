import test from 'node:test'
import assert from 'node:assert/strict'
import { includedTimeDisplay, copAmount } from '../src/features/projects/work-hours-ui.ts'

test('displayed included use and remaining time reconcile to the allowance', () => {
  assert.deepEqual(includedTimeDisplay(17_554_139, 6), {
    used: '4h 53m', remaining: '1h 7m', included: '6h',
  })
  assert.deepEqual(includedTimeDisplay(60_000, 1.25), {
    used: '0h 1m', remaining: '1h 14m', included: '1h 15m',
  })
})

test('included display stops at the allowance and supports zero included hours', () => {
  assert.deepEqual(includedTimeDisplay(21_600_001, 6), {
    used: '6h 0m', remaining: '0h 0m', included: '6h',
  })
  assert.deepEqual(includedTimeDisplay(3_600_000, 0), {
    used: '0h 0m', remaining: '0h 0m', included: '0h',
  })
})

test('cost identifies COP and preserves small exact-duration charges', () => {
  assert.equal(copAmount(0), 'COP 0')
  assert.equal(copAmount(1_000 / 3_600_000 * 65_000), 'COP 18,06')
})
