import assert from 'node:assert/strict'
import test from 'node:test'
import { applyWorkHoursCommand, emptyWorkHoursState, createWorkHoursReport } from '../electron/work-hours-model.ts'
import { billingPeriod } from '../electron/work-hours-billing.ts'

const evidence = {
  pr: { status: 'Not verified' as const, number: null, title: null, url: null, source: null, commit: null, checkedAt: null },
  ci: { status: 'Not verified' as const, source: null, commit: null, checkedAt: null },
  deployment: { status: 'Not verified' as const, source: null, commit: null, checkedAt: null },
}
const now = '2026-10-01T22:00:00Z'
function setup() {
  let state = applyWorkHoursCommand(emptyWorkHoursState(), { type: 'add-project', id: 'p', name: 'Project' }, now)
  state = applyWorkHoursCommand(state, { type: 'set-rate', projectId: 'p', ratePerHour: 65000 }, now)
  return applyWorkHoursCommand(state, { type: 'set-billing-policy', projectId: 'p', includedHours: 6, cycleDay: 22, timeZone: 'America/Bogota' }, now)
}
function work(state: ReturnType<typeof setup>, id: string, start: string, end: string) {
  return applyWorkHoursCommand(applyWorkHoursCommand(state, { type: 'start', id, projectId: 'p' }, start), { type: 'stop' }, end)
}
test('billing cycle runs from the 22nd at Bogotá midnight to the next 22nd', () => {
  assert.deepEqual(billingPeriod(now, 22, 'America/Bogota'), { start: '2026-09-22T05:00:00.000Z', end: '2026-10-22T05:00:00.000Z' })
  assert.equal(billingPeriod('2026-10-22T04:59:59Z', 22, 'America/Bogota').start, '2026-09-22T05:00:00.000Z')
  assert.equal(billingPeriod('2026-10-22T05:00:00Z', 22, 'America/Bogota').start, '2026-10-22T05:00:00.000Z')
})
test('six included hours are allocated across the cycle, not again per report', () => {
  let state = work(setup(), 'first', '2026-09-22T05:00:00Z', '2026-09-22T11:00:00Z')
  state = work(state, 'extra', '2026-09-23T05:00:00Z', '2026-09-23T06:00:00Z')
  const report = createWorkHoursReport(state, { id: 'report', projectId: 'p', sessionIds: ['extra'], task: 'Change' }, evidence, now)
  assert.equal(report.billableMs, 3600000)
  assert.equal(report.chargeableMs, 3600000)
  assert.equal(report.amount, 65000)
})
test('defect corrections do not consume included hours; unused hours reset next cycle', () => {
  let state = work(setup(), 'fix', '2026-09-22T05:00:00Z', '2026-09-22T12:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'correct-session', sessionId: 'fix', startedAt: state.sessions[0].startedAt, endedAt: state.sessions[0].endedAt, description: 'Defect correction', billable: false, prUrl: null }, now)
  state = work(state, 'change', '2026-09-23T05:00:00Z', '2026-09-23T08:00:00Z')
  const report = createWorkHoursReport(state, { id: 'report', projectId: 'p', sessionIds: ['change'], task: 'Change' }, evidence, now)
  assert.equal(report.chargeableMs, 0)
  assert.equal(report.amount, 0)
  state = work(state, 'next', '2026-10-22T05:00:00Z', '2026-10-22T12:00:00Z')
  const next = createWorkHoursReport(state, { id: 'next-report', projectId: 'p', sessionIds: ['next'], task: 'Change' }, evidence, '2026-10-23T12:00:00Z')
  assert.equal(next.chargeableMs, 3600000)
})
