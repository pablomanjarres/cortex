import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyWorkHoursCommand,
  createWorkHoursReport,
  emptyWorkHoursState,
  exportWorkHoursCsv,
  exportWorkHoursMarkdown,
  workHoursTotals,
  type WorkEvidence,
  type WorkHoursState,
} from '../electron/work-hours-model.ts'

const noEvidence: WorkEvidence = {
  pr: { status: 'Not verified', number: null, title: null, url: null, source: null, commit: null, checkedAt: null },
  ci: { status: 'Not verified', source: null, commit: null, checkedAt: null },
  deployment: { status: 'Not verified', source: null, commit: null, checkedAt: null },
}

function withProject(id = 'construcredit'): WorkHoursState {
  return applyWorkHoursCommand(emptyWorkHoursState(), { type: 'add-project', id, name: 'ConstruCredit' }, '2026-09-01T09:00:00Z')
}

function session(state: WorkHoursState, id: string, projectId: string, start: string, end: string): WorkHoursState {
  const started = applyWorkHoursCommand(state, { type: 'start', id, projectId }, start)
  return applyWorkHoursCommand(started, { type: 'stop' }, end)
}

test('Start then Stop records the exact 80-minute UTC interval', () => {
  let state = emptyWorkHoursState()
  state = applyWorkHoursCommand(state, { type: 'add-project', id: 'construcredit', name: 'ConstruCredit' }, '2026-09-01T10:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'start', id: 'session-1', projectId: 'construcredit' }, '2026-09-01T10:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'stop' }, '2026-09-01T11:20:00Z')

  assert.equal(state.active, null)
  assert.equal(state.sessions.length, 1)
  assert.deepEqual(state.sessions[0], {
    id: 'session-1',
    projectId: 'construcredit',
    startedAt: '2026-09-01T10:00:00.000Z',
    endedAt: '2026-09-01T11:20:00.000Z',
    durationMs: 4_800_000,
    description: '',
    billable: true,
    prUrl: null,
    needsReview: false,
    corrections: [],
  })
})

test('repeated Start and Stop do not create duplicate or overlapping sessions', () => {
  const project = withProject()
  const started = applyWorkHoursCommand(project, { type: 'start', id: 's1', projectId: 'construcredit' }, '2026-09-01T10:00:00Z')
  assert.throws(() => applyWorkHoursCommand(started, { type: 'start', id: 's2', projectId: 'construcredit' }, '2026-09-01T10:01:00Z'), /already active/)
  const stopped = applyWorkHoursCommand(started, { type: 'stop' }, '2026-09-01T11:00:00Z')
  assert.equal(applyWorkHoursCommand(stopped, { type: 'stop' }, '2026-09-01T11:01:00Z'), stopped)
  assert.deepEqual(stopped.sessions.map((row) => row.id), ['s1'])
})

test('Switch saves the prior project and starts another at the same instant', () => {
  let state = withProject()
  state = applyWorkHoursCommand(state, { type: 'add-project', id: 'cortex', name: 'Cortex' }, '2026-09-01T09:00:00Z')
  assert.throws(() => applyWorkHoursCommand(state, { type: 'switch', id: 's2', projectId: 'cortex' }, '2026-09-01T09:30:00Z'), /No active work/)
  state = applyWorkHoursCommand(state, { type: 'start', id: 's1', projectId: 'construcredit' }, '2026-09-01T10:00:00Z')
  assert.throws(() => applyWorkHoursCommand(state, { type: 'start', id: 's2', projectId: 'cortex' }, '2026-09-01T10:30:00Z'), /already active/)
  assert.throws(() => applyWorkHoursCommand(state, { type: 'switch', id: 's2', projectId: 'construcredit' }, '2026-09-01T10:30:00Z'), /different project/)
  state = applyWorkHoursCommand(state, { type: 'switch', id: 's2', projectId: 'cortex' }, '2026-09-01T10:30:00Z')
  assert.equal(state.sessions[0].endedAt, state.active?.startedAt)
  assert.equal(state.active?.projectId, 'cortex')
  state = applyWorkHoursCommand(state, { type: 'stop' }, '2026-09-01T11:00:00Z')
  assert.deepEqual(state.sessions.map((row) => row.durationMs), [1_800_000, 1_800_000])
})

test('project and session IDs are stable, unique, and validated', () => {
  const state = withProject()
  assert.throws(() => applyWorkHoursCommand(state, { type: 'add-project', id: 'construcredit', name: 'Again' }, '2026-09-01T10:00:00Z'), /already exists/)
  assert.throws(() => applyWorkHoursCommand(state, { type: 'add-project', id: '../bad', name: 'Bad' }, '2026-09-01T10:00:00Z'), /Invalid ID/)
  assert.throws(() => applyWorkHoursCommand(state, { type: 'start', id: 's1', projectId: 'missing' }, '2026-09-01T10:00:00Z'), /Project not found/)
  assert.throws(() => applyWorkHoursCommand(state, { type: 'start', id: 's1', projectId: 'construcredit' }, '2026-09-01T10:00:00'), /Invalid timestamp/)
  const stopped = session(state, 's1', 'construcredit', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z')
  assert.throws(() => applyWorkHoursCommand(stopped, { type: 'start', id: 's1', projectId: 'construcredit' }, '2026-09-01T12:00:00Z'), /already exists/)
})

test('corrections reject reversed times, preserve original values, and recompute exact duration', () => {
  const state = session(withProject(), 's1', 'construcredit', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z')
  assert.throws(() => applyWorkHoursCommand(state, { type: 'correct-session', sessionId: 's1', startedAt: '2026-09-01T12:00:00Z', endedAt: '2026-09-01T11:00:00Z', description: '', billable: false, prUrl: null }, '2026-09-01T13:00:00Z'), /end.*after start/i)
  const corrected = applyWorkHoursCommand(state, { type: 'correct-session', sessionId: 's1', startedAt: '2026-09-01T10:15:00Z', endedAt: '2026-09-01T11:00:00Z', description: 'Delivered billing fix', billable: false, prUrl: 'https://github.com/acme/repo/pull/12' }, '2026-09-01T13:00:00Z')
  assert.equal(corrected.sessions[0].durationMs, 2_700_000)
  assert.equal(corrected.sessions[0].billable, false)
  assert.deepEqual(corrected.sessions[0].corrections[0].before, {
    startedAt: '2026-09-01T10:00:00.000Z', endedAt: '2026-09-01T11:00:00.000Z',
    description: '', billable: true, prUrl: null,
  })
  assert.equal(state.sessions[0].corrections.length, 0)
})

test('local day and month totals split a session at Bogotá midnight', () => {
  const state = session(withProject(), 's1', 'construcredit', '2026-09-01T04:30:00Z', '2026-09-01T05:30:00Z')
  assert.deepEqual(workHoursTotals(state, 'construcredit', '2026-09-01T05:30:00Z', 'America/Bogota'), {
    todayMs: 1_800_000, monthMs: 1_800_000, totalMs: 3_600_000,
  })
})

test('restart closes the active interval for review and blocks it from reports', () => {
  let state = applyWorkHoursCommand(withProject(), { type: 'start', id: 's1', projectId: 'construcredit' }, '2026-09-01T10:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'mark-interrupted' }, '2026-09-02T10:00:00Z')
  assert.equal(state.active, null)
  assert.equal(state.sessions[0].needsReview, true)
  assert.equal(workHoursTotals(state, 'construcredit', '2026-09-02T10:00:00Z', 'UTC').totalMs, 0)
  assert.throws(() => createWorkHoursReport(state, { id: 'r1', projectId: 'construcredit', sessionIds: ['s1'], task: 'Delivery' }, noEvidence, '2026-09-02T10:00:00Z'), /review/i)
  state = applyWorkHoursCommand(state, { type: 'review-session', sessionId: 's1' }, '2026-09-02T11:00:00Z')
  assert.equal(state.sessions[0].needsReview, false)
})

test('report includes selected sessions, bills exact milliseconds, and snapshots rows and rate', () => {
  let state = withProject()
  state = applyWorkHoursCommand(state, { type: 'set-rate', projectId: 'construcredit', ratePerHour: 100_000 }, '2026-09-01T09:00:00Z')
  state = session(state, 's1', 'construcredit', '2026-09-01T10:00:00Z', '2026-09-01T11:00:01Z')
  state = session(state, 's2', 'construcredit', '2026-09-01T12:00:00Z', '2026-09-01T12:30:00Z')
  state = applyWorkHoursCommand(state, { type: 'correct-session', sessionId: 's2', startedAt: '2026-09-01T12:00:00Z', endedAt: '2026-09-01T12:30:00Z', description: 'Internal planning', billable: false, prUrl: null }, '2026-09-01T13:00:00Z')
  const report = createWorkHoursReport(state, { id: 'r1', projectId: 'construcredit', sessionIds: ['s1', 's2'], task: 'Client delivery' }, noEvidence, '2026-09-01T14:00:00Z')
  assert.equal(report.totalMs, 5_400_000 + 1_000)
  assert.equal(report.billableMs, 3_600_000 + 1_000)
  assert.equal(report.amount, (3_600_000 + 1_000) / 3_600_000 * 100_000)
  assert.deepEqual(report.rows.map((row) => row.id), ['s1', 's2'])
  state = applyWorkHoursCommand(state, { type: 'finalize-report', id: 'r1', projectId: 'construcredit', sessionIds: ['s1', 's2'], task: 'Client delivery', evidence: noEvidence }, '2026-09-01T14:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'set-rate', projectId: 'construcredit', ratePerHour: 200_000 }, '2026-09-01T15:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'correct-session', sessionId: 's1', startedAt: '2026-09-01T10:00:00Z', endedAt: '2026-09-01T10:30:00Z', description: 'Changed later', billable: true, prUrl: null }, '2026-09-01T16:00:00Z')
  assert.deepEqual(state.reports[0], report)
})

test('unset rate produces no amount, and missing evidence remains unverified', () => {
  const state = session(withProject(), 's1', 'construcredit', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z')
  const report = createWorkHoursReport(state, { id: 'r1', projectId: 'construcredit', sessionIds: ['s1'], task: 'Delivery' }, noEvidence, '2026-09-01T12:00:00Z')
  assert.equal(report.ratePerHour, null)
  assert.equal(report.amount, null)
  assert.match(exportWorkHoursMarkdown(report), /Not verified/)
  assert.doesNotMatch(exportWorkHoursMarkdown(report), /COP 0/)
})

test('PR, CI, and deployment remain independent evidence snapshots', () => {
  const state = session(withProject(), 's1', 'construcredit', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z')
  const evidence: WorkEvidence = {
    pr: { status: 'Merged', number: 12, title: 'Billing fix', url: 'https://github.com/acme/repo/pull/12', source: 'https://github.com/acme/repo/pull/12', commit: 'abc123', checkedAt: '2026-09-01T12:00:00Z' },
    ci: { status: 'Passed', source: 'https://github.com/acme/repo/actions/runs/1', commit: 'abc123', checkedAt: '2026-09-01T12:01:00Z' },
    deployment: { status: 'Not verified', source: null, commit: null, checkedAt: '2026-09-01T12:02:00Z' },
  }
  const report = createWorkHoursReport(state, { id: 'r1', projectId: 'construcredit', sessionIds: ['s1'], task: 'Delivery' }, evidence, '2026-09-01T13:00:00Z')
  evidence.deployment.status = 'Deployed'
  assert.equal(report.evidence.deployment.status, 'Not verified')
  const markdown = exportWorkHoursMarkdown(report)
  assert.match(markdown, /Merged/)
  assert.match(markdown, /Passed/)
  assert.match(markdown, /Not verified/)
  assert.doesNotMatch(markdown, /Deployed/)
})

test('a report cannot mix PR URLs or attach evidence for another PR', () => {
  let state = session(withProject(), 's1', 'construcredit', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z')
  state = session(state, 's2', 'construcredit', '2026-09-01T12:00:00Z', '2026-09-01T13:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'correct-session', sessionId: 's1', startedAt: '2026-09-01T10:00:00Z', endedAt: '2026-09-01T11:00:00Z', description: 'PR one', billable: true, prUrl: 'https://github.com/acme/repo/pull/12' }, '2026-09-01T14:00:00Z')
  const selection = { id: 'r1', projectId: 'construcredit', sessionIds: ['s1', 's2'], task: 'Delivery' }
  assert.doesNotThrow(() => createWorkHoursReport(state, selection, noEvidence, '2026-09-01T15:00:00Z'))
  const wrongEvidence: WorkEvidence = { ...noEvidence, pr: { ...noEvidence.pr, url: 'https://github.com/acme/repo/pull/13' } }
  assert.throws(() => createWorkHoursReport(state, selection, wrongEvidence, '2026-09-01T15:00:00Z'), /different PR/)
  state = applyWorkHoursCommand(state, { type: 'correct-session', sessionId: 's2', startedAt: '2026-09-01T12:00:00Z', endedAt: '2026-09-01T13:00:00Z', description: 'PR two', billable: true, prUrl: 'https://github.com/acme/repo/pull/13' }, '2026-09-01T14:00:00Z')
  assert.throws(() => createWorkHoursReport(state, selection, noEvidence, '2026-09-01T15:00:00Z'), /conflicting PR/)
  assert.throws(() => applyWorkHoursCommand(state, { type: 'finalize-report', ...selection, evidence: noEvidence }, '2026-09-01T15:00:00Z'), /conflicting PR/)
})

test('Unavailable remains internal but client exports say Not verified', () => {
  const state = session(withProject(), 's1', 'construcredit', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z')
  const unavailable: WorkEvidence = {
    pr: { ...noEvidence.pr, status: 'Unavailable' },
    ci: { ...noEvidence.ci, status: 'Unavailable' },
    deployment: { ...noEvidence.deployment, status: 'Unavailable' },
  }
  const report = createWorkHoursReport(state, { id: 'r1', projectId: 'construcredit', sessionIds: ['s1'], task: 'Delivery' }, unavailable, '2026-09-01T12:00:00Z')
  assert.equal(report.evidence.pr.status, 'Unavailable')
  assert.doesNotMatch(exportWorkHoursMarkdown(report) + exportWorkHoursCsv(report), /Unavailable/)
  assert.match(exportWorkHoursMarkdown(report), /Not verified/)
})

test('Markdown and CSV exports allow only client fields and escape untrusted values', () => {
  let state = session(withProject(), 's1', 'construcredit', '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z')
  state = applyWorkHoursCommand(state, { type: 'correct-session', sessionId: 's1', startedAt: '2026-09-01T10:00:00Z', endedAt: '2026-09-01T11:00:00Z', description: '=SUM(1,1) | <script>\nSECRET_TOKEN', billable: true, prUrl: null }, '2026-09-01T12:00:00Z')
  const report = createWorkHoursReport(state, { id: 'r1', projectId: 'construcredit', sessionIds: ['s1'], task: 'Task | <script>' }, noEvidence, '2026-09-01T12:00:00Z')
  const injected = { ...report, privatePrompt: 'PRIVATE_PROMPT', rows: report.rows.map((row) => ({ ...row, corrections: 'PRIVATE_CORRECTION' })) }
  const markdown = exportWorkHoursMarkdown(injected)
  const csv = exportWorkHoursCsv(injected)
  assert.doesNotMatch(markdown + csv, /PRIVATE_PROMPT|PRIVATE_CORRECTION|<script>/)
  assert.match(markdown, /Task \\| &lt;script&gt;/)
  assert.match(csv, /'=SUM\(1,1\)/)
  assert.match(csv, /Task,Time,PR,CI,Deployment,Billing/)
})
