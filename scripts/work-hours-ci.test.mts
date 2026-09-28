import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWorkHoursEvidence } from '../electron/work-hours-evidence.ts'
import { exportWorkHoursCsv, exportWorkHoursMarkdown, type WorkReport } from '../electron/work-hours-model.ts'

test('CI distinguishes named test and build checks from the aggregate status', () => {
  const commit = 'a'.repeat(40)
  const prUrl = 'https://github.com/acme/construcredit/pull/42'
  const evidence = parseWorkHoursEvidence({
    pr: {
      number: 42, title: 'Payment scoring', url: prUrl, state: 'MERGED',
      mergedAt: '2026-09-27T14:00:00Z', headRefOid: commit, mergeCommit: { oid: commit },
      statusCheckRollup: [
        { __typename: 'CheckRun', name: 'Pruebas y cobertura', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { __typename: 'CheckRun', name: 'Tipos y lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
      ],
    },
    deployments: [], statusesByDeploymentId: {},
  }, '2026-09-27T15:00:00Z')

  assert.equal(evidence.ci.status, 'Passed')
  assert.equal(evidence.ci.tests, 'Passed')
  assert.equal(evidence.ci.build, 'Not verified')

  const report: WorkReport = {
    id: 'report-1', projectId: 'project-1', projectName: 'ConstruCredit',
    createdAt: '2026-09-27T15:00:00Z', task: 'Payment scoring',
    rows: [{ id: 'session-1', startedAt: '2026-09-27T13:00:00Z', endedAt: '2026-09-27T14:20:00Z', durationMs: 4_800_000, description: 'Payment scoring', billable: true, prUrl }],
    totalMs: 4_800_000, billableMs: 4_800_000, ratePerHour: 100_000, currency: 'COP', amount: 133_333.33333333334,
    evidence,
  }
  assert.match(exportWorkHoursMarkdown(report), /Tests: Passed; Build: Not verified/)
  assert.match(exportWorkHoursCsv(report), /Tests: Passed; Build: Not verified/)
})
