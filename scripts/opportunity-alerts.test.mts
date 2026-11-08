// Acceptance tests for the opportunity alert queue (src/features/opportunities/opportunity-alerts.ts)
// and the facts it depends on: window status, deadline verification, travel flags, funding.
import assert from 'node:assert/strict'
import test from 'node:test'
import type { OppIntel, Opportunity } from '../src/features/opportunities/opportunity-model.ts'
import { emptyIntel } from '../src/features/opportunities/opportunity-intel.ts'
import {
  ackAlerts, reconcileAlerts, selectDelivery, type AlertStore,
} from '../src/features/opportunities/opportunity-alerts.ts'
import { fundingLines } from '../src/features/opportunities/opportunity-funding.ts'
import { applicationStatusOf, deadlineConfidenceOf } from '../src/features/opportunities/opportunity-window.ts'
import { eligibilityOf, scoreOpportunity, visibilityPatch } from '../src/features/opportunities/opportunity-score.ts'
import { premiumPatch } from '../src/features/opportunities/opportunity-model.ts'
import {
  DEFAULT_TRAVEL_READINESS, readinessOf, travelCheckOf,
} from '../src/features/opportunities/travel-readiness.ts'

const T0 = '2026-11-09'
const at = (day: string) => `${day}T14:00:00.000Z`
const readiness = DEFAULT_TRAVEL_READINESS

/** A remote AI fellowship that passes the profile; override per test. */
const opp = (fields: Partial<Opportunity> = {}, intel: Partial<OppIntel> = {}): Opportunity => ({
  id: 'opp-a', title: 'Orbit Fellowship', host: 'Orbit', category: 'fellowship', goals: [], priority: 'medium',
  leverageScore: 3, leverageNote: 'Equity-free money and a dense founder network.', status: 'new',
  deadline: '2026-12-15', deadlineType: 'fixed', rolling: false, location: 'Remote', modality: 'remote',
  eligibility: 'remote-global', reward: '', url: 'https://orbit.example/apply', officialUrl: 'https://orbit.example/fellowship',
  source: 'web', sourceRef: 'https://orbit.example/fellowship', discoveredAt: at(T0), runId: 'run-1', notes: '', tags: [],
  lastVerified: T0, evidence: 'https://orbit.example/fellowship: "Applications close December 15, 2026. Open worldwide, 18+."',
  intel: {
    ...emptyIntel(), fields: ['founder', 'ai', 'startups'], legit: true, ageMin: 18, colombiaAllowed: true,
    undergradAllowed: true, inPerson: false, cashUsd: 20_000, durationDays: 30, hoursPerWeek: 10, fullTime: false,
    prestige: 8, network: 9, founderDensity: 9, technicalDensity: 8, investorAccess: 8, careerUpside: 8,
    skillGain: 8, probability: 0.1, effortHours: 4, ...intel,
  },
  ...fields,
})

/** Run one reconcile and return the new store plus what it created. */
function check(store: AlertStore | null, items: Opportunity[], day = T0, runId = 'run-x') {
  return reconcileAlerts({ store, items, readiness, today: day, now: at(day), runId })
}
/** A store that has already baselined the given items. */
const baselined = (items: Opportunity[], day = T0) => check(null, items, day).store

test('fixture passes the profile, so alerts are about change, not the filter', () => {
  assert.equal(scoreOpportunity(opp(), T0).keep, true)
})

test('initial migration baselines silently: no alerts for existing radar items', () => {
  const items = Array.from({ length: 30 }, (_, n) => opp({ id: `opp-${n}`, title: `Program ${n}`, url: `https://p${n}.example/a`, officialUrl: '' }))
  const first = check(null, items)
  assert.equal(first.baseline, true)
  assert.equal(first.created.length, 0)
  assert.equal(Object.keys(first.store.snapshots).length, 30)
  const again = check(first.store, items)
  assert.equal(again.created.length, 0, 'unchanged items stay silent after the baseline too')
})

test('a new eligible open opportunity triggers exactly one notification', () => {
  const store = baselined([])
  const r = check(store, [opp()])
  assert.equal(r.created.length, 1)
  assert.equal(r.created[0].type, 'new_open')
  assert.match(r.created[0].text, /^New opportunity: Orbit Fellowship/)
  const d = selectDelivery(r.store, at(T0), 'all')
  assert.equal(d.urgent.length + d.digest.length, 1)
})

test('an existing unchanged opportunity triggers nothing', () => {
  const store = baselined([opp()])
  assert.equal(check(store, [opp({ runId: 'run-2' })]).created.length, 0)
})

test('repeated research runs never duplicate an alert', () => {
  let store = baselined([])
  const first = check(store, [opp()])
  store = first.store
  for (const run of ['run-2', 'run-3', 'run-4']) {
    const r = check(store, [opp({ runId: run })])
    assert.equal(r.created.length, 0, run)
    store = r.store
  }
  assert.equal(store.alerts.length, 1)
})

test('a future application window opening generates an alert', () => {
  const upcoming = opp({ opensAt: '2026-11-20', deadline: '2027-01-10' })
  assert.equal(applicationStatusOf(upcoming, T0), 'upcoming')
  const store = baselined([upcoming])
  const opened = check(store, [opp({ opensAt: '2026-11-20', deadline: '2027-01-10', runId: 'run-2', lastVerified: '2026-11-21' })], '2026-11-21')
  assert.deepEqual(opened.created.map((a) => a.type), ['opened'])
  assert.match(opened.created[0].card.headline, /^Applications now open/)
})

test('a previously closed opportunity reopening generates an alert', () => {
  const closed = opp({ deadline: null, deadlineType: 'recurring', nextWindowExpected: 'Estimated Jan 2027' })
  assert.equal(applicationStatusOf(closed, T0), 'closed')
  const store = baselined([closed])
  const reopened = check(store, [opp({ deadline: '2027-02-01', runId: 'run-2' })])
  assert.deepEqual(reopened.created.map((a) => a.type), ['reopened'])
})

test('a deadline that passed and comes back for a new cycle reads as reopened', () => {
  const store = baselined([opp({ deadline: '2026-11-12' })])
  const r = check(store, [opp({ deadline: '2027-11-12', runId: 'run-2', lastVerified: '2026-11-20' })], '2026-11-20')
  assert.deepEqual(r.created.map((a) => a.type), ['reopened'])
})

test('a deadline moving earlier triggers an urgent update', () => {
  const store = baselined([opp({ deadline: '2027-01-30' })])
  const r = check(store, [opp({ deadline: '2026-12-20', runId: 'run-2' })])
  const moved = r.created.find((a) => a.type === 'deadline_changed')
  assert.ok(moved, 'deadline_changed alert')
  assert.equal(moved.priority, 'urgent')
  assert.match(moved.card.headline, /moved earlier/)
  const d = selectDelivery(r.store, at(T0), 'urgent')
  assert.deepEqual(d.urgent.map((g) => g.opportunityId), ['opp-a'])
})

test('a small later shift is noise; a week or more later is a digest update', () => {
  const store = baselined([opp({ deadline: '2026-12-15' })])
  assert.equal(check(store, [opp({ deadline: '2026-12-17', runId: 'run-2' })]).created.length, 0)
  const later = check(store, [opp({ deadline: '2026-12-29', runId: 'run-2' })]).created
  assert.equal(later[0]?.type, 'deadline_changed')
  assert.equal(later[0]?.priority, 'digest')
})

test('new travel funding becomes a support alert', () => {
  const inPerson = { modality: 'in-person' as const, location: 'Zurich, Switzerland' }
  const store = baselined([opp(inPerson, { inPerson: true, city: 'Zurich', country: 'Switzerland', travelCovered: false })])
  const r = check(store, [opp({ ...inPerson, runId: 'run-2' }, { inPerson: true, city: 'Zurich', country: 'Switzerland', travelCovered: true, housingCovered: true })])
  const support = r.created.find((a) => a.type === 'support_added')
  assert.ok(support)
  assert.match(support.card.headline, /travel funding, housing/)
})

test('a verified deadline within 7 days is urgent; a stale or unsupported one is not verified', () => {
  const soon = opp({ deadline: '2026-11-14' })
  assert.equal(deadlineConfidenceOf(soon, T0), 'verified')
  const store = baselined([soon])
  const urgent = check(store, [soon]).created
  assert.deepEqual(urgent.map((a) => [a.type, a.priority]), [['deadline_soon', 'urgent']])

  const stale = opp({ deadline: '2026-11-14', lastVerified: '2026-09-01' })
  const unsupported = opp({ deadline: '2026-11-14', evidence: null, notes: 'no source' })
  assert.equal(deadlineConfidenceOf(stale, T0), 'stale')
  assert.equal(deadlineConfidenceOf(unsupported, T0), 'unsupported')
  for (const o of [stale, unsupported]) {
    const created = check(baselined([]), [o]).created
    assert.equal(created.length, 1)
    assert.equal(created[0].priority, 'digest', 'never urgent on an unverified date')
    assert.equal(created[0].card.action, 'Verify')
    assert.match(created[0].card.deadline.label, /Not verified/)
    assert.doesNotMatch(created[0].text, /verified 20/)
  }
})

test('a U.S. event in March 2027 is flagged US_TRAVEL_BLOCKED and never interrupts', () => {
  const sf = opp({ modality: 'in-person', location: 'San Francisco, CA', programStart: '2027-03-12', programEnd: '2027-03-14', deadline: '2026-11-13' },
    { inPerson: true, city: 'San Francisco', country: 'United States', travelCovered: true })
  assert.equal(travelCheckOf(sf, readiness).flag, 'US_TRAVEL_BLOCKED')
  const created = check(baselined([]), [sf]).created
  assert.ok(created.length >= 1)
  for (const a of created) {
    assert.equal(a.card.action, 'Skip')
    assert.equal(a.priority, 'digest')
    assert.match(a.text, /Visa\/travel: US_TRAVEL_BLOCKED/)
  }
})

test('unknown U.S. dates are VISA_PENDING, not an invented block; after May 2027 still pending', () => {
  const noDates = opp({ modality: 'in-person', location: 'Boston, MA' }, { inPerson: true, city: 'Boston', country: 'United States' })
  assert.equal(travelCheckOf(noDates, readiness).flag, 'VISA_PENDING')
  const june = opp({ modality: 'in-person', location: 'New York', programStart: '2027-06-01' }, { inPerson: true, city: 'New York' })
  assert.equal(travelCheckOf(june, readiness).flag, 'VISA_PENDING')
})

test('a remote opportunity is never visa-blocked, even when the host is in the U.S.', () => {
  const remote = opp({ location: 'Remote (San Francisco-based)', programStart: '2027-03-01' }, { inPerson: false, country: 'United States' })
  assert.deepEqual(travelCheckOf(remote, readiness), { flag: null, reason: '' })
})

test('travel readiness is user data: approving the visa clears the flag', () => {
  const sf = opp({ modality: 'in-person', location: 'Stanford, CA', programStart: '2027-03-01' }, { inPerson: true, city: 'Stanford' })
  const approved = readinessOf({ updatedAt: at(T0), rules: [{ country: 'US', visa: 'approved', blockedBefore: '2027-05-01' }] })
  assert.equal(travelCheckOf(sf, approved).flag, null)
  const later = readinessOf({ updatedAt: at(T0), rules: [{ country: 'US', visa: 'pending', blockedBefore: '2027-02-01' }] })
  assert.equal(travelCheckOf(sf, later).flag, 'VISA_PENDING')
})

