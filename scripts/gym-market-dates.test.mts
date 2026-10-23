import assert from 'node:assert/strict'
import { test } from 'node:test'
import { relativeMarketDate } from '../src/features/gym/domain/market-dates.ts'

const at = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h).toISOString()

test('labels count local calendar days before the selected today', () => {
  assert.equal(relativeMarketDate(at(2026, 9, 23, 8), '2026-10-23'), 'today')
  assert.equal(relativeMarketDate(at(2026, 9, 22, 23), '2026-10-23'), 'yesterday')
  assert.equal(relativeMarketDate(at(2026, 9, 19, 1), '2026-10-23'), '4d ago')
  assert.equal(relativeMarketDate(at(2026, 9, 2, 12), '2026-10-23'), '2 Oct')
})

test('future or invalid timestamps never produce a negative label', () => {
  assert.equal(relativeMarketDate(at(2026, 9, 25, 12), '2026-10-23'), 'today')
  assert.equal(relativeMarketDate('not a date', '2026-10-23'), '')
})
