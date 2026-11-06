import assert from 'node:assert/strict'
import test from 'node:test'
import type { OppIntel, Opportunity } from '../src/features/opportunities/opportunity-model.ts'
import { emptyIntel, normalizeIntel } from '../src/features/opportunities/opportunity-intel.ts'
import {
  fundingClassOf, hardCheck, isApplyNow, scoreOpportunity, timeCostPenalty, urgencyOf, visibilityPatch,
} from '../src/features/opportunities/opportunity-score.ts'

const today = '2026-11-06'
const opp = (fields: Partial<Opportunity> = {}, intel: Partial<OppIntel> = {}): Opportunity => ({
  id: 'o', title: 'Fixture', host: '', category: 'program', goals: [], priority: 'medium', leverageScore: 3,
  leverageNote: '', status: 'new', deadline: '2026-11-25', rolling: false, location: '', eligibility: 'unknown',
  reward: '', url: '', source: 'web', sourceRef: '', discoveredAt: '', notes: '', tags: [],
  lastVerified: today,
  intel: { ...emptyIntel(), ageMin: 18, colombiaAllowed: true, undergradAllowed: true, legit: true, ...intel },
  ...fields,
})

const stanfordHackathon = opp({ category: 'hackathon', location: 'Stanford, CA' }, {
  fields: ['ai', 'hackathon'], inPerson: true, city: 'Stanford', country: 'United States',
  travelCovered: true, housingCovered: true, durationDays: 3, prestige: 9, network: 9,
  founderDensity: 7, technicalDensity: 9, careerUpside: 7, skillGain: 7, probability: 0.3, effortHours: 3,
})
const fourMonthRelocation = opp({ category: 'accelerator', location: 'Santiago, Chile' }, {
  fields: ['startups', 'founder'], inPerson: true, country: 'Chile', cashUsd: 15_000, durationDays: 120,
  fullTime: true, relocation: true, prestige: 6, network: 6, careerUpside: 6, skillGain: 6, probability: 0.3,
})
const thiel = opp({ category: 'fellowship', deadlineType: 'rolling', deadline: null }, {
  fields: ['founder', 'startups'], inPerson: true, city: 'San Francisco', cashUsd: 200_000,
  durationDays: 730, fullTime: true, relocation: true, dropout: true, prestige: 10, network: 10,
  founderDensity: 10, investorAccess: 9, careerUpside: 9, skillGain: 8, probability: 0.02, effortHours: 20,
})

test('a funded 3-day Stanford hackathon beats $15k for four relocated months', () => {
  const short = scoreOpportunity(stanfordHackathon, today)
  const long = scoreOpportunity(fourMonthRelocation, today)
  assert.equal(short.funding, 'full')
  assert.equal(short.keep, true)
  assert.ok(short.score > long.score + 20, `${short.score} vs ${long.score}`)
})

test('dropping out is only acceptable at Thiel level', () => {
  assert.equal(scoreOpportunity(thiel, today).keep, true)
  const lesser = opp({}, { ...thiel.intel, prestige: 6, cashUsd: 20_000 })
  assert.deepEqual(hardCheck(lesser, today).reasons, ['requires dropping out'])
})

test('hard filters reject age, Colombia, undergrad, closed, off-field and sketchy', () => {
  const reasons = (o: Opportunity) => hardCheck(o, today).reasons
  assert.deepEqual(reasons(opp({}, { ageMin: 21 })), ['age 21+'])
  assert.deepEqual(reasons(opp({}, { colombiaAllowed: false })), ['not open to Colombia'])
  assert.deepEqual(reasons(opp({}, { undergradAllowed: false })), ['no undergrads'])
  assert.deepEqual(reasons(opp({ deadline: '2026-10-01' })), ['closed'])
  assert.deepEqual(reasons(opp({ category: 'trending', intel: undefined })), ['off-field'])
  assert.deepEqual(reasons(opp({}, { legit: false })), ['not legit'])
})

test('a closed fixed deadline is never "apply now"; a recurring one moves to the watchlist', () => {
  const treehacks = opp({ category: 'hackathon', deadline: '2026-10-20' })
  assert.equal(urgencyOf(treehacks, today), 'closed')
  assert.equal(scoreOpportunity(treehacks, today).keep, false)
  const recurring = opp({ deadline: '2026-10-20', deadlineType: 'recurring' })
  assert.equal(urgencyOf(recurring, today), 'watchlist')
  assert.equal(isApplyNow(urgencyOf(recurring, today)), false)
})

test('urgency buckets follow the 7 / 21 / 60 day lines', () => {
  const u = (deadline: string) => urgencyOf(opp({ deadline }), today)
  assert.deepEqual(
    ['2026-11-10', '2026-11-20', '2026-12-20', '2027-03-01'].map(u),
    ['urgent', 'high', 'prepare', 'pipeline'],
  )
  assert.equal(urgencyOf(opp({ deadlineType: 'rolling', deadline: null }), today), 'rolling')
})

test('funding classes separate covered trips from leftover costs', () => {
  const f = (intel: Partial<OppIntel>) => fundingClassOf(opp({}, { inPerson: true, ...intel }))
  assert.equal(f({ travelCovered: true, housingCovered: true }), 'full')
  assert.equal(f({ travelCapUsd: 1000, housingCovered: true }), 'mostly')
  assert.equal(f({ travelCapUsd: 300 }), 'partial')
  assert.equal(f({ feeUsd: 500 }), 'none')
  assert.equal(f({}), 'unknown')
  assert.equal(fundingClassOf(opp({}, { inPerson: false, stipendUsd: 6000 })), 'full')
})

test('time cost grows with full-time weeks and leaving school', () => {
  const p = (intel: Partial<OppIntel>) => timeCostPenalty(opp({}, intel))
  assert.ok(p({ durationDays: 3 }) < 2)
  assert.ok(p({ durationDays: 70, fullTime: true }) > 8)
  assert.equal(p({ durationDays: 730, dropout: true }), 10)
})

test('legacy scraped hackathons without research facts stay hidden', () => {
  const legacy = opp({ category: 'hackathon', modality: 'remote', eligibility: 'remote-global', lastVerified: null, intel: undefined })
  const scored = scoreOpportunity(legacy, today)
  assert.equal(scored.keep, false)
  assert.match(scored.reasons[0], /^low score/)
})

test('robotics mode lifts humanoid work over generic IoT', () => {
  const humanoid = opp({ category: 'research' }, { fields: ['humanoids', 'research'], hardwareAccess: true })
  const iot = opp({ category: 'research' }, { fields: ['iot', 'research'] })
  assert.ok(scoreOpportunity(humanoid, today, 'robotics').score > scoreOpportunity(iot, today, 'robotics').score + 20)
})

test('visibility hides failing new items, restores recovered ones, and leaves his choices alone', () => {
  const junk = opp({ category: 'trending', intel: undefined })
  assert.deepEqual(visibilityPatch(junk, today), { status: 'archived', hiddenReason: 'off-field' })
  assert.equal(visibilityPatch({ ...junk, status: 'archived', hiddenReason: 'off-field' }, today), null)
  assert.deepEqual(visibilityPatch({ ...stanfordHackathon, status: 'archived', hiddenReason: 'closed' }, today), { status: 'new', hiddenReason: null })
  assert.equal(visibilityPatch({ ...junk, status: 'applied' }, today), null)
  assert.equal(visibilityPatch({ ...junk, status: 'archived', hiddenReason: null }, today), null)
  assert.equal(visibilityPatch(stanfordHackathon, today), null)
})

test('normalizeIntel drops junk and clamps ranges', () => {
  const i = normalizeIntel({ fields: ['ai', 'blockchain', 'ai'], probability: 4, prestige: '7', legit: 'yes', ageMin: null })
  assert.deepEqual(i.fields, ['ai'])
  assert.equal(i.probability, 1)
  assert.equal(i.prestige, 7)
  assert.equal(i.legit, null)
  assert.equal(i.ageMin, null)
})
