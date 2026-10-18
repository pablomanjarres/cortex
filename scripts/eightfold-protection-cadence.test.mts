import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProtectionView } from '../src/features/system/eightfold-view.ts'
import { NOW, okResponse, reportWith } from '../e2e/eightfold-health-fixture.ts'

const ago = (hours: number) => new Date(NOW.getTime() - hours * 3600_000).toISOString()
const check = (report: Record<string, unknown>, id: string) => buildProtectionView(okResponse(report), NOW).checks.find(c => c.id === id)!

test('hourly local and cloud backups warn within their respective grace periods', () => {
  const report = reportWith({ backup_local: { last_snapshot_time: ago(3) }, backup_cloud: { verified_checkpoint_time: ago(7) } })
  assert.equal(check(report, 'local').status, 'Overdue')
  assert.equal(check(report, 'cloud').status, 'Overdue')
})

test('a fresh health file cannot make an old sync observation current', () => {
  const view = buildProtectionView(okResponse(reportWith({ sync: { updated_at: ago(1) } })), NOW)
  assert.notEqual(view.state, 'ok')
  assert.ok(view.checks.filter(c => c.group === 'Sync').every(c => c.tone === 'unknown'))
  assert.equal(view.macPending, null)
  assert.equal(view.windowsPending, null)
})

test('a Windows-only connection error does not claim the Mac service is down', () => {
  const report = reportWith({ sync: { available: true, error: 'Windows has not connected for days', windows: { configured: true, connected: false } } })
  assert.equal(check(report, 'mac').status, 'Up to date')
  assert.equal(check(report, 'windows').status, 'Offline')
})

test('weekly checks and monthly full reads follow their own cadences', () => {
  const current = reportWith({ integrity: { last_quick_check: ago(3 * 24), last_full_check: ago(20 * 24) } })
  assert.equal(check(current, 'integrity').tone, 'ok')
  assert.equal(check(reportWith({ integrity: { last_quick_check: ago(10 * 24), last_full_check: ago(20 * 24) } }), 'integrity').tone, 'warning')
  assert.equal(check(reportWith({ integrity: { last_quick_check: ago(2 * 24), last_full_check: ago(36 * 24) } }), 'integrity').tone, 'warning')
})
