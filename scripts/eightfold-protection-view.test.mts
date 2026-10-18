import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProtectionView, REPORT_STALE_SECONDS, type ProtectionView } from '../src/features/system/eightfold-view.ts'
import { NOW, healthyReport, okResponse, reportWith } from '../e2e/eightfold-health-fixture.ts'

const check = (view: ProtectionView, id: string) => {
  const found = view.checks.find((c) => c.id === id)
  assert.ok(found, `missing check ${id}`)
  return found
}

test('a fresh healthy report is protected with every check passing', () => {
  const view = buildProtectionView(okResponse(healthyReport()), NOW)
  assert.equal(view.state, 'ok')
  assert.equal(view.headline, 'Protected')
  assert.deepEqual(view.checks.map((c) => [c.id, c.tone]), [
    ['mac', 'ok'], ['windows', 'ok'], ['conflicts', 'ok'], ['local', 'ok'],
    ['cloud', 'ok'], ['integrity', 'ok'], ['restore', 'ok'], ['recovery', 'ok'],
  ])
  assert.equal(view.cloudCheckpointAt, '2026-10-18T07:25:23.000Z')
  assert.equal(view.macPending, 0)
  assert.equal(view.windowsPending, 0)
  assert.equal(check(view, 'recovery').detail, 'Backup password copy confirmed in Apple Passwords.')
})

test('an offline Windows PC with a backlog and conflicts needs attention', () => {
  const view = buildProtectionView(okResponse(reportWith({
    sync: {
      ...(healthyReport().sync as object),
      conflicts: 2, mac_needs_items: 3,
      windows: { configured: true, connected: false, last_seen: '2026-10-18T05:10:00Z', pending_items: 14 },
    },
  })), NOW)
  assert.equal(view.state, 'attention')
  assert.equal(check(view, 'windows').status, 'Offline')
  assert.equal(check(view, 'windows').detail, 'Last seen 3h ago.')
  assert.equal(check(view, 'mac').status, 'Syncing')
  assert.equal(check(view, 'conflicts').status, '2 conflicts')
  assert.equal(check(view, 'conflicts').tone, 'danger')
  assert.equal(view.windowsPending, 14)
  assert.equal(view.macPending, 3)
  assert.equal(view.conflicts, 2)
})

test('a pending cloud upload keeps the last verified checkpoint separate from the local snapshot', () => {
  const view = buildProtectionView(okResponse(reportWith({
    backup_local: { last_snapshot_time: '2026-10-18T08:00:00Z' },
    backup_cloud: { upload_state: 'pending', pending_since: '2026-10-18T08:00:00Z', verified_checkpoint_time: '2026-10-17T07:25:23Z' },
  })), NOW)
  assert.equal(view.state, 'attention')
  assert.equal(check(view, 'local').tone, 'ok')
  assert.equal(check(view, 'local').at, '2026-10-18T08:00:00.000Z')
  assert.equal(check(view, 'cloud').status, 'Pending')
  assert.equal(check(view, 'cloud').at, '2026-10-17T07:25:23.000Z')
  assert.match(check(view, 'cloud').detail, /Waiting since 10m ago\. Last verified checkpoint 1d ago\./)
})

test('an errored cloud upload is reported as failed, not verified', () => {
  const view = buildProtectionView(okResponse(reportWith({ backup_cloud: { upload_state: 'verified', upload_errors: 2 } })), NOW)
  assert.equal(check(view, 'cloud').status, 'Upload failed')
  assert.equal(check(view, 'cloud').tone, 'danger')
  assert.equal(view.state, 'attention')
})

test('a partly verified cloud copy and a failed restore drill are flagged', () => {
  const view = buildProtectionView(okResponse(reportWith({
    backup_cloud: { files_verified: 12 },
    restore: { drill_cloud_ok: false },
  })), NOW)
  assert.equal(check(view, 'cloud').status, 'Partly verified')
  assert.equal(check(view, 'restore').status, 'Failed')
})

test('an unverified recovery copy is not treated as protected', () => {
  const view = buildProtectionView(okResponse(reportWith({ recovery: { manager_copy_verified: false } })), NOW)
  assert.equal(check(view, 'recovery').status, 'Not verified')
  assert.equal(view.state, 'attention')
})

test('a stale report never reads as protected', () => {
  const view = buildProtectionView(okResponse(healthyReport(), REPORT_STALE_SECONDS + 60), NOW)
  assert.equal(view.state, 'stale')
  assert.equal(view.headline, 'Report is stale')
  assert.ok(view.checks.every((c) => c.tone !== 'ok'))
  assert.match(view.note, /31m ago/)
})

test('silent sections are unknown rather than fine', () => {
  const health = healthyReport()
  delete health.recovery
  delete health.restore
  const view = buildProtectionView(okResponse(health), NOW)
  assert.equal(view.state, 'unknown')
  assert.equal(check(view, 'recovery').status, 'Not reported')
  assert.equal(check(view, 'restore').tone, 'unknown')
})

test('missing, unreadable and unreachable reports have no checks and an honest state', () => {
  const missing = buildProtectionView({ status: 'missing', readAt: NOW.toISOString(), error: 'x' }, NOW)
  assert.equal(missing.state, 'missing')
  assert.equal(missing.checks.length, 0)
  assert.equal(buildProtectionView({ status: 'invalid', readAt: NOW.toISOString(), error: 'x' }, NOW).state, 'unavailable')
  assert.equal(buildProtectionView(null, NOW).state, 'unavailable')
})

test('the view never carries filesystem paths or snapshot identifiers', () => {
  const health = reportWith({
    backup_local: { repo: '/Users/someone/private/repo', last_snapshot_id: 'abc12345' },
    backup_cloud: { root: '/Users/someone/Cloud', verified_checkpoint_snapshot: 'def67890' },
    sync: { ...(healthyReport().sync as object), conflict_files: ['/Users/someone/vault/a.sync-conflict.md'], source: 'syncthing@mac http://127.0.0.1:8384' },
  })
  const text = JSON.stringify(buildProtectionView(okResponse(health), NOW))
  for (const leaked of ['/Users/', 'abc12345', 'def67890', '127.0.0.1', 'sync-conflict']) assert.ok(!text.includes(leaked), leaked)
})
