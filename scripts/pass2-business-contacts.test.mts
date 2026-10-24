import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contactsToReachOut, daysOverdue, upcomingBirthdays, withContactDefaults,
} from '../src/features/social/contact-model.ts'
import { noelleContactChannel, noelleContactKey } from '../src/features/crm/noelle-crm-model.ts'
import type { NoelleCrmContact } from '../electron/noelle-crm.ts'

const now = Date.parse('2026-10-23T12:00:00Z')
const contact = (id: string, fields: Record<string, unknown> = {}) => withContactDefaults({ id, name: id, ...fields })

test('reach-out lists only contacts past their interval, most overdue first', () => {
  const contacts = [
    contact('slightly', { lastContact: '2026-10-10', interval: 10 }),
    contact('very', { lastContact: '2026-08-01', interval: 30 }),
    contact('on-time', { lastContact: '2026-10-20', interval: 14 }),
    contact('no-interval', { lastContact: '2026-01-01' }),
    contact('never', { interval: 7 }),
  ]
  assert.deepEqual(contactsToReachOut(contacts, now).map((c) => c.id), ['very', 'slightly'])
  assert.equal(daysOverdue(contacts[0], now), 4)
  assert.equal(daysOverdue(contacts[3], now), null)
})

test('upcoming birthdays stay within the window and sort soonest first, across the new year', () => {
  const today = new Date(2026, 11, 20, 12)
  const contacts = [
    contact('january', { birthday: '1990-01-05' }),
    contact('christmas', { birthday: '1995-12-25' }),
    contact('spring', { birthday: '1992-04-01' }),
    contact('unknown'),
  ]
  assert.deepEqual(upcomingBirthdays(contacts, 30, today).map((c) => c.id), ['christmas', 'january'])
})

test('DM contacts are keyed per platform and label a missing handle cleanly', () => {
  const base = { id: '42', name: 'Fixture', handle: '', platform: 'x' } as NoelleCrmContact
  assert.notEqual(noelleContactKey(base), noelleContactKey({ ...base, platform: 'linkedin' }))
  assert.equal(noelleContactChannel(base), 'X')
  assert.equal(noelleContactChannel({ ...base, platform: 'linkedin', handle: 'fixture' }), 'LinkedIn · fixture')
})
