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

test('investment is never reported as an equity-free grant', () => {
  const accel = opp({ category: 'accelerator', amountUsd: 300_000 }, { cashUsd: null, investmentUsd: 300_000, equityPct: 7 })
  const lines = fundingLines(accel)
  assert.deepEqual(lines, ['Investment: $300,000 for 7% equity (not a grant)'])
  assert.ok(lines.every((l) => !/grant: \$300/i.test(l)))
  const text = check(baselined([]), [accel]).created[0]?.text ?? ''
  assert.match(text, /Investment: \$300,000 for 7% equity \(not a grant\)/)
  assert.doesNotMatch(text, /Grant: \$300,000/)
  // A legacy amount with no intel is never called a grant either.
  assert.deepEqual(fundingLines(opp({ amountUsd: 50_000, intel: undefined })), ['Amount: $50,000 (type unverified, not counted as a grant)'])
  // A real grant and an investment side by side stay separate.
  assert.deepEqual(fundingLines(opp({}, { cashUsd: 10_000, investmentUsd: 100_000 })), [
    'Grant: $10,000 (equity-free)', 'Investment: $100,000 for equity (not a grant)',
  ])
})

test('failed delivery keeps alerts queued; a later success delivers them once', () => {
  const r = check(baselined([]), [opp()])
  const ids = selectDelivery(r.store, at(T0), 'all').alertIds
  const failed = ackAlerts(r.store, { ids, delivered: false, channel: 'kaiser', note: 'post failed', now: at(T0) })
  assert.deepEqual(failed.failed, ids)
  assert.equal(failed.store.alerts[0].state, 'pending')
  assert.equal(failed.store.alerts[0].deliveries[0].ok, false)
  assert.deepEqual(selectDelivery(failed.store, at(T0), 'all').alertIds, ids, 'still offered next time')

  const ok = ackAlerts(failed.store, { ids, delivered: true, channel: 'kaiser', now: at(T0) })
  assert.deepEqual(ok.acked, ids)
  const again = ackAlerts(ok.store, { ids, delivered: true, channel: 'kaiser', now: at(T0) })
  assert.deepEqual(again.already, ids, 'acking twice is a no-op')
  assert.equal(selectDelivery(ok.store, at(T0), 'all').hasAlerts, false)
})

test('an unacknowledged alert survives later checks (offline Mac, missed poll)', () => {
  let store = check(baselined([]), [opp()]).store
  for (const day of ['2026-11-10', '2026-11-11', '2026-11-12']) store = check(store, [opp()], day).store
  assert.equal(store.alerts.filter((a) => a.state === 'pending').length, 1)
})

test('pending alerts expire once he applies or applications close', () => {
  const store = check(baselined([]), [opp()]).store
  assert.equal(check(store, [opp({ status: 'applied' })]).store.alerts[0].state, 'expired')
  assert.equal(check(store, [opp()], '2026-12-16').store.alerts[0].state, 'expired')
})

test('digest: urgent always, at most 5 others, weekly in auto mode, one card per opportunity', () => {
  const many = Array.from({ length: 8 }, (_, n) => opp({ id: `opp-${n}`, title: `Program ${n}`, url: `https://p${n}.example/a`, officialUrl: '', deadline: '2027-01-20' }))
  const urgent = opp({ id: 'opp-u', title: 'Closing Soon', url: 'https://u.example/a', officialUrl: '', deadline: '2026-11-12' })
  const r = check(baselined([]), [...many, urgent])
  // The urgent one has two alerts (new + deadline soon) but is one card.
  assert.equal(r.created.filter((a) => a.opportunityId === 'opp-u').length, 2)
  const d = selectDelivery(r.store, at(T0), 'auto')
  assert.equal(d.urgent.length, 1)
  assert.equal(d.digest.length, 5)
  assert.equal(d.overflowIds.length, 3)
  assert.match(d.message, /\+3 more on the Cortex Opportunity Radar/)
  const acked = ackAlerts(r.store, { ids: d.alertIds, delivered: true, channel: 'kaiser', now: at(T0) }).store
  assert.equal(acked.lastDigestAt, at(T0))
  // A new digest-level find two days later waits for next week's digest.
  const next = check(acked, [...many, urgent, opp({ id: 'opp-new', title: 'Fresh', url: 'https://f.example/a', officialUrl: '', deadline: '2027-02-01' })], '2026-11-11').store
  assert.equal(selectDelivery(next, at('2026-11-11'), 'auto').hasAlerts, false)
  assert.equal(selectDelivery(next, at('2026-11-16'), 'auto').digest.length, 1)
})

test('premium items are never auto-hidden and outrank the rest', () => {
  const weak = opp({ premium: true }, { fields: ['iot'], prestige: 2, network: 2, founderDensity: 2, technicalDensity: 2 })
  assert.equal(scoreOpportunity(weak, T0).keep, false)
  assert.equal(visibilityPatch(weak, T0), null)
  assert.deepEqual(visibilityPatch({ ...weak, status: 'archived', hiddenReason: 'off-field' }, T0), { status: 'new', hiddenReason: null })
  const r = check(baselined([]), [weak])
  assert.equal(r.created.length, 1, 'premium alerts even when the profile would hide it')
  assert.match(r.created[0].text, /Premium: on your 100% list/)
})

test('he is not alerted about things he added himself or already applied to', () => {
  assert.equal(check(baselined([]), [opp({ source: 'manual' })]).created.length, 0)
  assert.equal(check(baselined([]), [opp({ status: 'applied' })]).created.length, 0)
})

test('every alert card carries the full notification format', () => {
  const a = check(baselined([]), [opp()]).created[0]
  for (const field of ['Why it matters', 'Funding', 'Deadline', 'Where and when', 'Eligibility', 'Visa/travel', 'Apply', 'Recommended action']) {
    assert.match(a.text, new RegExp(`- ${field.replace('/', '\\/')}: `), field)
  }
  assert.match(a.text, /Deadline: 2026-12-15 \(36 days left, verified 2026-11-09\)/)
  assert.match(a.text, /Eligibility: confirmed/)
  assert.match(a.text, /Recommended action: Prepare/)
})

// ── Regressions from the independent review ──────────────────────────────────

test('urgent delivery that carries a digest-level alert does not reset the weekly digest clock', () => {
  // opp-a: new (digest, deadline far) ... then its deadline moves earlier (urgent).
  let store = check(baselined([]), [opp({ deadline: '2027-01-30' }), opp({ id: 'opp-c', title: 'Other', url: 'https://c.example/a', officialUrl: '', deadline: '2027-02-01' })]).store
  const digest = selectDelivery(store, at(T0), 'all')
  store = ackAlerts(store, { ids: digest.alertIds, delivered: true, channel: 'kaiser', now: at(T0) }).store
  const firstDigest = store.lastDigestAt
  store = check(store, [opp({ deadline: '2026-12-20', runId: 'run-2' }), opp({ id: 'opp-c', title: 'Other', url: 'https://c.example/a', officialUrl: '' , deadline: '2027-02-01' })], '2026-11-10').store
  store = check(store, [opp({ deadline: '2026-12-20', runId: 'run-2' }), opp({ id: 'opp-c', title: 'Other', url: 'https://c.example/a', officialUrl: '', deadline: '2027-02-01', runId: 'run-2' }, { travelCovered: true }) ], '2026-11-10').store
  const urgentOnly = selectDelivery(store, at('2026-11-10'), 'urgent')
  assert.ok(urgentOnly.urgent.length >= 1)
  const after = ackAlerts(store, { ids: urgentOnly.alertIds, delivered: true, channel: 'kaiser', now: at('2026-11-10') }).store
  assert.equal(after.lastDigestAt, firstDigest)
})

test('an urgent group with a pending digest alert of the same opportunity keeps the digest clock', () => {
  let store = check(baselined([]), [opp({ deadline: '2027-01-30' })]).store // new_open, digest
  store = check(store, [opp({ deadline: '2026-11-14', runId: 'run-2' })]).store // moved earlier + soon, urgent
  const d = selectDelivery(store, at(T0), 'urgent')
  assert.equal(d.urgent.length, 1)
  assert.ok(d.alertIds.length >= 2, 'the digest-priority new_open rides along in the urgent card')
  assert.equal(ackAlerts(store, { ids: d.alertIds, delivered: true, channel: 'kaiser', now: at(T0) }).store.lastDigestAt, null)
})

test('an opening date that passes with no deadline yet reads as open and alerts once', () => {
  const upcoming = opp({ opensAt: '2026-11-20', deadline: null, deadlineType: 'unknown' })
  const store = baselined([upcoming])
  assert.equal(applicationStatusOf(upcoming, '2026-11-21'), 'open')
  const r = check(store, [upcoming], '2026-11-21')
  assert.deepEqual(r.created.map((a) => a.type), ['opened'])
  assert.equal(r.created[0].card.deadline.confidence, 'none')
})

test('a stated "no undergrads" is reported as stated, not as unknown', () => {
  const elite = opp({}, { undergradAllowed: false, prestige: 10, cashUsd: 200_000 })
  const e = eligibilityOf(elite, T0)
  assert.equal(e.level, 'unclear')
  assert.doesNotMatch(e.note, /Unstated/)
})

test('evidence falls back to notes only for records that predate the evidence field', () => {
  const legacy = opp({ evidence: undefined, notes: 'https://orbit.example — "closes Dec 15"' })
  assert.equal(deadlineConfidenceOf(legacy, T0), 'verified')
  const touched = opp({ evidence: null, notes: 'see https://my-notes.example' })
  assert.equal(deadlineConfidenceOf(touched, T0), 'unsupported')
})

test('premium switch brings back a profile-hidden item, never one he archived', () => {
  assert.deepEqual(premiumPatch({ status: 'archived', hiddenReason: 'off-field' }, true), { premium: true, status: 'new', hiddenReason: null })
  assert.deepEqual(premiumPatch({ status: 'archived', hiddenReason: null }, true), { premium: true })
  assert.deepEqual(premiumPatch({ status: 'new', hiddenReason: null }, false), { premium: false })
})
