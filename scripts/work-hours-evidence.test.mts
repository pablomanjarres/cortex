import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchWorkHoursEvidence, parseGitHubPrUrl, parseWorkHoursEvidence } from '../electron/work-hours-evidence.ts'

const checkedAt = '2026-09-27T18:30:00.000Z'
const prUrl = 'https://github.com/acme/construcredit/pull/42'
const commit = 'a'.repeat(40)

test('an open PR with no checks or deployments keeps CI and production unverified', () => {
  const evidence = parseWorkHoursEvidence({
    pr: {
      number: 42,
      title: 'Add project hours',
      url: prUrl,
      state: 'OPEN',
      mergedAt: null,
      headRefOid: commit,
      statusCheckRollup: [],
    },
    deployments: [],
    statusesByDeploymentId: {},
  }, checkedAt)

  assert.deepEqual(evidence, {
    pr: { status: 'Open', number: 42, title: 'Add project hours', url: prUrl, source: prUrl, commit, checkedAt },
    ci: { status: 'Not verified', tests: 'Not verified', build: 'Not verified', source: null, commit, checkedAt },
    deployment: { status: 'Not verified', source: null, commit, checkedAt },
  })
})

test('a merged PR with successful checks still has no production proof', () => {
  const evidence = parseWorkHoursEvidence({
    pr: {
      number: 42,
      title: 'Add project hours',
      url: prUrl,
      state: 'MERGED',
      mergedAt: '2026-09-27T18:00:00Z',
      headRefOid: commit,
      mergeCommit: { oid: commit },
      statusCheckRollup: [
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: 'https://github.com/acme/construcredit/actions/runs/11' },
        { __typename: 'StatusContext', state: 'SUCCESS', targetUrl: 'https://ci.example.test/build/11' },
      ],
    },
    deployments: [],
    statusesByDeploymentId: {},
  }, checkedAt)

  assert.equal(evidence.pr.status, 'Merged')
  assert.deepEqual(evidence.ci, {
    status: 'Passed',
    tests: 'Not verified',
    build: 'Not verified',
    source: `https://github.com/acme/construcredit/commit/${commit}/checks`,
    commit,
    checkedAt,
  })
  assert.deepEqual(evidence.deployment, { status: 'Not verified', source: null, commit, checkedAt })
})

test('a failed check marks CI failed even while another check is pending', () => {
  const evidence = parseWorkHoursEvidence({
    pr: {
      number: 42,
      title: 'Add project hours',
      url: prUrl,
      state: 'OPEN',
      mergedAt: null,
      headRefOid: commit,
      statusCheckRollup: [
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
        { __typename: 'StatusContext', state: 'PENDING' },
      ],
    },
    deployments: [],
    statusesByDeploymentId: {},
  }, checkedAt)

  assert.equal(evidence.ci.status, 'Failed')
  assert.equal(evidence.ci.source, `https://github.com/acme/construcredit/commit/${commit}/checks`)
  assert.equal(evidence.deployment.status, 'Not verified')
})

test('an unfinished check keeps CI pending', () => {
  const evidence = parseWorkHoursEvidence({
    pr: {
      number: 42,
      title: 'Add project hours',
      url: prUrl,
      state: 'OPEN',
      mergedAt: null,
      headRefOid: commit,
      statusCheckRollup: [
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: null },
      ],
    },
    deployments: [],
    statusesByDeploymentId: {},
  }, checkedAt)

  assert.equal(evidence.ci.status, 'Pending')
  assert.equal(evidence.deployment.status, 'Not verified')
})

test('production is deployed only for a successful status on the exact PR commit', () => {
  const source = 'https://api.github.com/repos/acme/construcredit/deployments/103/statuses/8'
  const evidence = parseWorkHoursEvidence({
    pr: {
      number: 42,
      title: 'Add project hours',
      url: prUrl,
      state: 'MERGED',
      mergedAt: '2026-09-27T18:00:00Z',
      headRefOid: commit,
      mergeCommit: { oid: commit },
      statusCheckRollup: [],
    },
    deployments: [
      { id: 101, sha: 'b'.repeat(40), environment: 'production', created_at: '2026-09-27T18:20:00Z' },
      { id: 102, sha: commit, environment: 'staging', created_at: '2026-09-27T18:21:00Z' },
      { id: 103, sha: commit, environment: 'Production', created_at: '2026-09-27T18:22:00Z' },
    ],
    statusesByDeploymentId: {
      '101': [{ state: 'success' }],
      '102': [{ state: 'success' }],
      '103': [{ state: 'success', created_at: '2026-09-27T18:25:00Z', url: source }],
    },
  }, checkedAt)

  assert.deepEqual(evidence.deployment, { status: 'Deployed', source, commit, checkedAt })
})

test('latest production failure and pending states remain visible', () => {
  const pr = {
    number: 42, title: 'Add project hours', url: prUrl, state: 'MERGED',
    mergedAt: '2026-09-27T18:00:00Z', headRefOid: commit,
    mergeCommit: { oid: commit }, statusCheckRollup: [],
  }
  const source = 'https://api.github.com/repos/acme/construcredit/deployments/103/statuses/9'
  for (const [state, expected] of [
    ['failure', 'Failed'], ['error', 'Failed'],
    ['pending', 'Pending'], ['in_progress', 'Pending'], ['queued', 'Pending'],
  ] as const) {
    const evidence = parseWorkHoursEvidence({
      pr,
      deployments: [{ id: 103, sha: commit, environment: 'production', created_at: '2026-09-27T18:20:00Z' }],
      statusesByDeploymentId: { '103': [
        { id: 8, state: 'success', created_at: '2026-09-27T18:21:00Z' },
        { id: 9, state, created_at: '2026-09-27T18:22:00Z', url: source },
      ] },
    }, checkedAt)
    assert.deepEqual(evidence.deployment, { status: expected, source, commit, checkedAt })
  }
})

test('merged PR deployment follows the merge commit while CI follows the head commit', () => {
  const mergeCommit = 'c'.repeat(40)
  const source = 'https://api.github.com/repos/acme/construcredit/deployments/202/statuses/9'
  const evidence = parseWorkHoursEvidence({
    pr: {
      number: 42, title: 'Add project hours', url: prUrl, state: 'MERGED',
      mergedAt: '2026-09-27T18:00:00Z', headRefOid: commit,
      mergeCommit: { oid: mergeCommit },
      statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    },
    deployments: [
      { id: 201, sha: commit, environment: 'production', created_at: '2026-09-27T18:10:00Z' },
      { id: 202, sha: mergeCommit, environment: 'production', created_at: '2026-09-27T18:11:00Z' },
    ],
    statusesByDeploymentId: {
      '201': [{ state: 'success', url: 'https://api.github.com/repos/acme/construcredit/deployments/201/statuses/8' }],
      '202': [{ state: 'success', url: source }],
    },
  }, checkedAt)

  assert.equal(evidence.ci.commit, commit)
  assert.deepEqual(evidence.deployment, { status: 'Deployed', source, commit: mergeCommit, checkedAt })
})

test('only exact HTTPS GitHub pull URLs with positive numbers are accepted', () => {
  assert.deepEqual(parseGitHubPrUrl(prUrl), { owner: 'acme', repo: 'construcredit', number: 42, url: prUrl })
  for (const bad of [
    'http://github.com/acme/construcredit/pull/42',
    'https://github.com.evil.test/acme/construcredit/pull/42',
    'https://github.com/acme/construcredit/pull/0',
    'https://github.com/acme/construcredit/pull/-1',
    'https://github.com/acme/construcredit/pull/42/files',
    'https://github.com/acme/construcredit/pull/42?foo=bar',
    'https://github.com/acme/construcredit/pull/999999999999999999999',
  ]) assert.throws(() => parseGitHubPrUrl(bad), /GitHub PR URL/)
})

test('fetch rejects a malformed PR URL before running GitHub CLI', async () => {
  await assert.rejects(fetchWorkHoursEvidence('https://github.com/acme/construcredit/pull/0'), /GitHub PR URL/)
})
