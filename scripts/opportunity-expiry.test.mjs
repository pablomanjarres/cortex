// node --test scripts/opportunity-expiry.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOpportunityActive, isOpportunityExpired, daysUntilDeadline } from '../src/features/opportunities/expiry.ts'
import { localDate } from '../src/lib/date-utils.ts'

const today = '2026-09-13'
const opportunity = (fields = {}) => ({ status: 'new', deadline: '2026-09-12', rolling: false, ...fields })

test('expired opportunities leave the active list in every status', () => {
  for (const status of ['new', 'pursuing', 'applied', 'won', 'lost', 'archived']) {
    assert.equal(isOpportunityActive(opportunity({ status }), today), false, status)
  }
})

test('a deadline stays open through its local calendar day', () => {
  const item = opportunity({ deadline: today })
  assert.equal(isOpportunityExpired(item, '2026-09-12'), false)
  assert.equal(isOpportunityExpired(item, today), false)
  assert.equal(isOpportunityExpired(item, '2026-09-14'), true)
})

test('UTC rollover does not close a deadline before midnight in Bogota', () => {
  const previousTZ = process.env.TZ
  process.env.TZ = 'America/Bogota'
  try {
    const localToday = localDate(new Date('2026-09-14T04:59:59Z'))
    assert.equal(localToday, today)
    assert.equal(isOpportunityActive(opportunity({ deadline: today }), localToday), true)
  } finally {
    if (previousTZ === undefined) delete process.env.TZ
    else process.env.TZ = previousTZ
  }
})

test('expired recurring windows hide until a future deadline is recorded', () => {
  const item = opportunity({ deadlineType: 'recurring' })
  assert.equal(isOpportunityExpired(item, today), true)
  assert.equal(isOpportunityActive({ ...item, deadline: '2027-09-12' }, today), true)
})

test('rolling and always-open records stay visible despite an old date', () => {
  for (const fields of [{ rolling: true }, { deadlineType: 'rolling' }, { deadlineType: 'always-open' }]) {
    assert.equal(isOpportunityActive(opportunity(fields), today), true)
  }
  assert.equal(isOpportunityExpired(opportunity({ rolling: true, deadlineType: 'fixed' }), today), true)
})

test('unknown, missing, and malformed dates cannot silently hide a record', () => {
  for (const deadline of [null, '', 'not a date', '2026-02-30', '2026-13-01', '2026-9-1']) {
    assert.equal(isOpportunityActive(opportunity({ deadline }), today), true, String(deadline))
    assert.equal(daysUntilDeadline(deadline, today), null, String(deadline))
  }
  assert.equal(isOpportunityExpired(opportunity({ deadlineType: 'unknown' }), today), true)
})

test('archived records stay out of the active list even with future or rolling deadlines', () => {
  assert.equal(isOpportunityActive(opportunity({ status: 'archived', deadline: '2027-01-01' }), today), false)
  assert.equal(isOpportunityActive(opportunity({ status: 'archived', rolling: true }), today), false)
})

test('deadline countdown uses the same calendar boundary as expiry', () => {
  assert.equal(daysUntilDeadline('2026-09-12', today), -1)
  assert.equal(daysUntilDeadline(today, today), 0)
  assert.equal(daysUntilDeadline('2026-09-14', today), 1)
  assert.equal(daysUntilDeadline('2026-03-09', '2026-03-08'), 1)
  assert.equal(daysUntilDeadline('2028-02-29', '2028-02-28'), 1)
})

test('visibility checks preserve records and user statuses for the archive toggle', () => {
  const item = Object.freeze(opportunity({ status: 'applied' }))
  const items = Object.freeze([item])
  assert.deepEqual(items.filter((o) => isOpportunityActive(o, today)), [])
  assert.equal(items.length, 1)
  assert.equal(item.status, 'applied')
})
