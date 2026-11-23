import assert from 'node:assert/strict'
import test from 'node:test'
import type { OppIntel, Opportunity } from '../src/features/opportunities/opportunity-model.ts'
import { emptyIntel } from '../src/features/opportunities/opportunity-intel.ts'
import { letterCountOf, statusConfig } from '../src/features/opportunities/opportunity-model.ts'
import { countdownOf, factChips, hiddenLabel, lettersChip, placeLabel, radarView } from '../src/features/opportunities/opportunity-radar.ts'

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
    opp({ id: 'mine-closed', status: 'pursuing', deadline: '2026-10-01' }, null),
  ], today, 'balanced')
  const ids = (rows: { o: Opportunity }[]) => rows.map((r) => r.o.id)
  assert.deepEqual(ids(view.apply), ['better', 'open', 'mine'])
  assert.deepEqual(ids(view.applied), ['applied'])
  assert.deepEqual(ids(view.watchlist), ['next-cycle'])
  assert.deepEqual(ids(view.hidden).sort(), ['closed', 'junk', 'mine-closed'])
  assert.equal(hiddenLabel(view.hidden.find((r) => r.o.id === 'mine-closed')!), 'closed')
})

test('an item moved to the Watchlist stays there whether its window is open, closed or unknown', () => {
  const view = radarView([
    opp({ id: 'open-soon', status: 'watching', deadline: '2026-11-01' }),
    opp({ id: 'closed', status: 'watching', deadline: '2026-10-01' }),
    opp({ id: 'unscored', status: 'watching', category: 'hackathon' }, null),
    opp({ id: 'auto', deadline: '2026-11-01' }),
  ], today, 'balanced')
  const ids = (rows: { o: Opportunity }[]) => rows.map((r) => r.o.id).sort()
  assert.deepEqual(ids(view.apply), ['auto'])
  assert.deepEqual(ids(view.watchlist), ['closed', 'open-soon', 'unscored'])
  assert.deepEqual(ids(view.hidden), [])
  assert.equal(statusConfig.watching.label, 'Watchlist')
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

test('opportunities that need recommendation letters get a flag and a filter', () => {
  const items = [
    opp({ id: 'two', deadline: '2026-11-10', recommendationLetters: 2 }),
    opp({ id: 'one', deadline: '2026-11-10', recommendationLetters: 1 }),
    opp({ id: 'none', deadline: '2026-11-10', recommendationLetters: 0 }),
    opp({ id: 'unstated', deadline: '2026-11-10' }),
  ]
  assert.deepEqual(radarView(items, today, 'balanced', ['letters']).apply.map((r) => r.o.id).sort(), ['one', 'two'])
  assert.equal(lettersChip(items[0])?.text, '2 rec letters')
  assert.equal(lettersChip(items[0])?.variant, 'warning')
  assert.equal(lettersChip(items[1])?.text, 'Rec letter')
  assert.equal(lettersChip(items[2]), null)
  assert.equal(lettersChip(items[3]), null)
})

test('a hand-typed letter count is a whole number from 0 to 10, blank is unstated', () => {
  assert.equal(letterCountOf(''), null)
  assert.equal(letterCountOf('2'), 2)
  assert.equal(letterCountOf('-1'), 0)
  assert.equal(letterCountOf(2.6), 3)
  assert.equal(letterCountOf(null), null)
})

test('place and fact chips stay short', () => {
  assert.equal(placeLabel(opp({}, { inPerson: true, city: 'Zurich' })), 'Zurich')
  assert.equal(placeLabel(opp({ modality: 'remote' }, null)), 'Remote')
  assert.deepEqual(factChips(opp({}, { travelCapUsd: 1000, durationDays: 4, probability: 0.3, cashUsd: null })),
    ['Travel up to $1k', '4 days', '~30% odds', 'Verified Oct 23'])
})
