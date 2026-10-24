import assert from 'node:assert/strict'
import test from 'node:test'
import type { Opportunity } from '../src/features/opportunities/opportunity-model.ts'
import {
  countdownOf, objectiveMatches, objectiveSummary, regionForText, regionOf, topPicks, urgencySections,
} from '../src/features/opportunities/opportunity-radar.ts'

const today = '2026-10-23'
const opp = (fields: Partial<Opportunity> = {}): Opportunity => ({
  id: 'o', title: 'Fixture', host: '', category: 'other', goals: [], priority: 'medium', leverageScore: 3,
  leverageNote: '', status: 'new', deadline: null, rolling: false, location: '', eligibility: 'unknown',
  reward: '', url: '', source: 'manual', sourceRef: '', discoveredAt: '', notes: '', tags: [],
  ...fields,
})

test('regions read accent-insensitively and the most specific one wins', () => {
  assert.equal(regionOf(opp({ location: 'Medellín (remote)' })), 'colombia')
  assert.equal(regionOf(opp({ location: 'Remote', tags: ['latam'] })), 'latam')
  assert.equal(regionOf(opp({ location: 'Somewhere' })), 'other')
  assert.equal(regionForText('Bogotá · Cali'), 'colombia')
  assert.equal(regionForText('Atlantis'), null)
})

test('urgency sections keep recurring programs waiting instead of closed', () => {
  const sections = urgencySections([
    opp({ id: 'old-cycle', deadlineType: 'recurring', deadline: '2026-10-01' }),
    opp({ id: 'just-closed', deadline: '2026-10-20' }),
    opp({ id: 'soon', deadline: '2026-10-26' }),
    opp({ id: 'sooner', deadline: '2026-10-24' }),
    opp({ id: 'legacy-rolling', rolling: true }),
  ], today)
  assert.deepEqual(sections.map((s) => [s.key, s.items.map((o) => o.id)]), [
    ['week', ['sooner', 'soon']],
    ['rolling', ['legacy-rolling']],
    ['upcoming', ['old-cycle']],
    ['closed', ['just-closed']],
  ])
})

test('countdowns tone by urgency and never count down an open window', () => {
  assert.deepEqual(countdownOf(opp({ deadline: '2026-10-25' }), today), { text: 'D-2', variant: 'danger', title: 'Oct 25' })
  assert.equal(countdownOf(opp({ deadline: '2026-11-03' }), today).variant, 'warning')
  assert.equal(countdownOf(opp({ deadlineType: 'always-open', deadline: '2026-10-25' }), today).text, 'always open')
  assert.equal(countdownOf(opp({ deadlineType: 'recurring', nextWindowExpected: 'Opens Sep 2027' }), today).text, 'opens ~Sep 2027')
})

test('top picks boost imminent deadlines and skip items already acted on', () => {
  const picks = topPicks([
    opp({ id: 'applied', priority: 'high', leverageScore: 5, status: 'applied' }),
    opp({ id: 'later', priority: 'high', leverageScore: 4, deadline: '2026-12-31' }),
    opp({ id: 'imminent', priority: 'medium', leverageScore: 4, deadline: '2026-10-25' }),
    opp({ id: 'rolling', priority: 'high', leverageScore: 4, deadlineType: 'rolling', deadline: '2026-10-25' }),
  ], today)
  assert.deepEqual(picks.map((o) => o.id), ['imminent', 'later', 'rolling'])
})

test('hunt orders match on parsed constraints and summarize what radar read', () => {
  const parsed = { category: 'internship' as const, locations: ['Bogotá'], deadlineBefore: '2026-12-01', salaryText: '$2k+/mo' }
  assert.equal(objectiveMatches(opp({ category: 'internship', location: 'Bogota', deadline: '2026-11-15' }), parsed), true)
  assert.equal(objectiveMatches(opp({ category: 'internship', location: 'Bogota', deadline: '2027-01-15' }), parsed), false)
  assert.equal(objectiveMatches(opp({ category: 'internship', location: 'Bogota', status: 'lost' }), parsed), false)
  assert.deepEqual(objectiveSummary(parsed), ['Internship', 'Bogotá', '$2k+/mo', 'by Dec 1'])
})
