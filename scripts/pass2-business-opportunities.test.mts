import assert from 'node:assert/strict'
import test from 'node:test'
import type { OppIntel, Opportunity } from '../src/features/opportunities/opportunity-model.ts'
import { emptyIntel } from '../src/features/opportunities/opportunity-intel.ts'
import { countdownOf, factChips, placeLabel, radarView } from '../src/features/opportunities/opportunity-radar.ts'

const today = '2026-10-23'
const opp = (fields: Partial<Opportunity> = {}, intel: Partial<OppIntel> | null = {}): Opportunity => ({
  id: 'o', title: 'Fixture', host: '', category: 'fellowship', goals: [], priority: 'medium', leverageScore: 3,
  leverageNote: '', status: 'new', deadline: null, rolling: false, location: '', eligibility: 'unknown',
  reward: '', url: '', source: 'web', sourceRef: '', discoveredAt: '', notes: '', tags: [], lastVerified: today,
  ...(intel ? {
    intel: {
      ...emptyIntel(), fields: ['founder'], ageMin: 18, colombiaAllowed: true, undergradAllowed: true, legit: true,
      prestige: 8, network: 8, careerUpside: 7, skillGain: 7, cashUsd: 10_000, durationDays: 7, ...intel,
    },
  } : {}),
  ...fields,
})

test('countdowns tone by urgency and never count down an open window', () => {
  assert.deepEqual(countdownOf(opp({ deadline: '2026-10-25' }), today), { text: 'D-2', variant: 'danger', title: 'Oct 25' })
  assert.equal(countdownOf(opp({ deadline: '2026-11-03' }), today).variant, 'warning')
  assert.equal(countdownOf(opp({ deadlineType: 'always-open', deadline: '2026-10-25' }), today).text, 'always open')
  assert.equal(countdownOf(opp({ deadlineType: 'recurring', nextWindowExpected: 'Opens Sep 2027' }), today).text, 'opens ~Sep 2027')
  assert.equal(countdownOf(opp({ deadline: '2026-10-01', nextWindowExpected: 'Opens Sep 2027' }), today).text, 'opens ~Sep 2027')
})

test('the view splits apply, applied, watchlist and hidden, and never shows closed as apply', () => {
  const view = radarView([
    opp({ id: 'open', deadline: '2026-11-10' }),
    opp({ id: 'better', deadline: '2026-11-10' }, { prestige: 10, network: 10 }),
    opp({ id: 'applied', status: 'applied', deadline: '2026-10-01' }),
    opp({ id: 'next-cycle', deadline: '2026-10-01', deadlineType: 'recurring' }),
    opp({ id: 'closed', deadline: '2026-10-01' }),
    opp({ id: 'junk', category: 'hackathon' }, null),
    opp({ id: 'mine', status: 'pursuing', deadline: '2026-11-10' }, null),
  ], today, 'balanced')
  const ids = (rows: { o: Opportunity }[]) => rows.map((r) => r.o.id)
  assert.deepEqual(ids(view.apply), ['better', 'open', 'mine'])
  assert.deepEqual(ids(view.applied), ['applied'])
  assert.deepEqual(ids(view.watchlist), ['next-cycle'])
  assert.deepEqual(ids(view.hidden).sort(), ['closed', 'junk'])
})

test('filters narrow to remote, in person, funded and closing soon', () => {
  const items = [
    opp({ id: 'sf', deadline: '2026-11-01' }, { inPerson: true, city: 'San Francisco', travelCovered: true, housingCovered: true }),
    opp({ id: 'remote', deadline: '2026-12-30' }, { inPerson: false, cashUsd: 0 }),
  ]
  const ids = (f: Parameters<typeof radarView>[3]) => radarView(items, today, 'balanced', f).apply.map((r) => r.o.id)
  assert.deepEqual(ids(['in-person']), ['sf'])
  assert.deepEqual(ids(['remote']), ['remote'])
  assert.deepEqual(ids(['funded']), ['sf'])
  assert.deepEqual(ids(['soon']), ['sf'])
  assert.deepEqual(ids(['remote', 'funded']), [])
})

test('place and fact chips stay short', () => {
  assert.equal(placeLabel(opp({}, { inPerson: true, city: 'Zurich' })), 'Zurich')
  assert.equal(placeLabel(opp({ modality: 'remote' }, null)), 'Remote')
  assert.deepEqual(factChips(opp({}, { travelCapUsd: 1000, durationDays: 4, probability: 0.3, cashUsd: null })),
    ['Travel up to $1k', '4 days', '~30% odds', 'Verified Oct 23'])
})
