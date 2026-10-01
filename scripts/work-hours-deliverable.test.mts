import assert from 'node:assert/strict'
import test from 'node:test'
import { applyWorkHoursCommand, type WorkHoursCommand, type WorkHoursState } from '../electron/work-hours-model.ts'

const at = '2026-09-29T12:00:00.000Z'
const prUrl = 'https://github.com/acme/construcredit/pull/12'
const attach = { type: 'attach-deliverable', id: 'hook-one', prUrl, description: '  Fix loan calculation  ' } as const

function completedState(): WorkHoursState {
  return {
    projects: [{ id: 'construcredit', name: 'ConstruCredit', currency: 'COP', ratePerHour: 120_000 }],
    active: { id: 'manual', projectId: 'construcredit', startedAt: '2026-09-29T11:30:00.000Z', interrupted: false },
    sessions: [{
      id: 'hook-one', projectId: 'construcredit', startedAt: '2026-09-29T10:00:00.000Z',
      endedAt: '2026-09-29T11:00:00.000Z', durationMs: 3_600_000, description: '',
      billable: false, prUrl: null, needsReview: true, corrections: [],
    }],
    reports: [],
  }
}

test('deliverable attachment changes metadata only and records the prior values', () => {
  const before = completedState()
  const next = applyWorkHoursCommand(before, attach, at)
  assert.deepEqual(next.sessions[0], {
    ...before.sessions[0], description: 'Fix loan calculation', prUrl,
    corrections: [{
      correctedAt: at,
      before: {
        startedAt: '2026-09-29T10:00:00.000Z', endedAt: '2026-09-29T11:00:00.000Z',
        description: '', billable: false, prUrl: null,
      },
      after: {
        startedAt: '2026-09-29T10:00:00.000Z', endedAt: '2026-09-29T11:00:00.000Z',
        description: 'Fix loan calculation', billable: false, prUrl,
      },
    }],
  })
  assert.deepEqual(next.active, before.active)
  assert.deepEqual(next.projects, before.projects)
  assert.equal(before.sessions[0].description, '')
  assert.equal(before.sessions[0].corrections.length, 0)
})

test('deliverable retries preserve a user description and do not add duplicate corrections', () => {
  const before = completedState()
  before.sessions[0].description = '  User reviewed the result.  '
  const attached = applyWorkHoursCommand(before, attach, at)
  assert.equal(attached.sessions[0].description, '  User reviewed the result.  ')
  assert.equal(attached.sessions[0].prUrl, prUrl)
  assert.equal(attached.sessions[0].corrections.length, 1)
  const retried = applyWorkHoursCommand(attached, { ...attach, description: 'New agent wording' }, '2026-09-29T12:01:00.000Z')
  assert.equal(retried, attached)
})

test('a conflicting PR is rejected without changing any saved metadata', () => {
  const before = completedState()
  before.sessions[0].prUrl = 'https://github.com/acme/construcredit/pull/13'
  const snapshot = structuredClone(before)
  assert.throws(() => applyWorkHoursCommand(before, attach, at), /different PR/)
  assert.deepEqual(before, snapshot)
})

test('deliverable attachment requires a saved session and valid input', () => {
  const before = completedState()
  assert.throws(() => applyWorkHoursCommand(before, { ...attach, id: 'manual' }, at), /Session not found/)
  for (const invalid of [
    { ...attach, id: undefined },
    { ...attach, prUrl: null },
    { ...attach, prUrl: 'http://github.com/acme/construcredit/pull/12' },
    { ...attach, prUrl: 'not a URL' },
    { ...attach, description: 12 },
  ]) {
    assert.throws(() => applyWorkHoursCommand(before, invalid as WorkHoursCommand, at), /Invalid/)
  }
})

test('deliverable attachment leaves finalized report snapshots and previous corrections intact', () => {
  let before = completedState()
  before.sessions[0].needsReview = false
  before = applyWorkHoursCommand(before, {
    type: 'correct-session', sessionId: 'hook-one',
    startedAt: '2026-09-29T10:00:00.000Z', endedAt: '2026-09-29T10:30:00.000Z',
    description: '', billable: false, prUrl: null,
  }, at)
  before = applyWorkHoursCommand(before, {
    type: 'finalize-report', id: 'report-one', projectId: 'construcredit', sessionIds: ['hook-one'], task: 'Loan work',
    evidence: {
      pr: { status: 'Not verified', number: null, title: null, url: null, source: null, commit: null, checkedAt: null },
      ci: { status: 'Not verified', source: null, commit: null, checkedAt: null },
      deployment: { status: 'Not verified', source: null, commit: null, checkedAt: null },
    },
  }, at)
  const snapshot = structuredClone(before)
  const attached = applyWorkHoursCommand(before, attach, at)
  assert.deepEqual(attached.reports, snapshot.reports)
  assert.deepEqual(attached.sessions[0].corrections.slice(0, 1), snapshot.sessions[0].corrections)
  assert.equal(attached.sessions[0].durationMs, 1_800_000)
  assert.equal(attached.sessions[0].billable, false)
  assert.equal(attached.sessions[0].needsReview, false)
})
