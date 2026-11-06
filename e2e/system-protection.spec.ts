import type { Page } from '@playwright/test'
import { test, expect, mockStores } from './fixtures'
import { NOW, healthyReport, okResponse, reportWith } from './eightfold-health-fixture'

type Reply = { status: number; json: unknown }
const ok = (health: Record<string, unknown>, ageSeconds?: number): Reply => ({ status: 200, json: okResponse(health, ageSeconds) })
const failed: Reply = { status: 500, json: { error: 'boom' } }

/** Opens System with a fixed clock; `serve` swaps what the health endpoint answers next. */
async function openSystem(page: Page, first: Reply) {
  let reply = first
  let reads = 0
  await page.clock.install({ time: NOW })
  await mockStores(page)
  await page.route('**/api/system/**', (route) => route.fulfill({ status: 503, json: { error: 'offline' } }))
  await page.route('**/api/knowledge/health', (route) => {
    reads += 1
    return route.fulfill(reply)
  })
  await page.goto('/#/system')
  const panel = page.locator('#eightfold-protection')
  return {
    panel,
    reads: () => reads,
    serve: (next: Reply) => { reply = next },
    refresh: () => panel.getByRole('button', { name: 'Refresh protection status' }).click(),
  }
}

test('a healthy report shows sync, backups and recovery evidence without private details', async ({ page }) => {
  const { panel } = await openSystem(page, ok(reportWith({
    backup_local: { repo: '/Users/someone/private/repo', last_snapshot_id: 'abc12345' },
  })))
  await expect(panel.getByRole('status')).toContainText('Protected')
  await expect(panel.getByRole('region', { name: 'Sync' })).toContainText('Windows')
  await expect(panel.getByRole('region', { name: 'Sync' })).toContainText('Up to date')
  await expect(panel.getByRole('region', { name: 'Backups' })).toContainText('Verified')
  await expect(panel.getByRole('region', { name: 'Evidence' })).toContainText('Backup password copy confirmed in Apple Passwords.')
  await expect(panel).toContainText('Verified cloud checkpoint')
  await expect(panel).not.toContainText('/Users/')
  await expect(panel).not.toContainText('abc12345')
  await panel.getByRole('button', { name: 'Founder' }).click()
  await expect(page).toHaveURL(/#\/founder/)
})

test('an offline Windows PC, pending items and conflicts need attention', async ({ page }) => {
  const { panel } = await openSystem(page, ok(reportWith({
    sync: {
      ...(healthyReport().sync as object), conflicts: 2, mac_needs_items: 3,
      windows: { configured: true, connected: false, last_seen: '2026-10-18T05:10:00Z', pending_items: 14 },
    },
  })))
  await expect(panel.getByRole('status')).toContainText('Needs attention')
  const sync = panel.getByRole('region', { name: 'Sync' })
  await expect(sync).toContainText('Offline')
  await expect(sync).toContainText('Last seen 3h ago.')
  await expect(sync).toContainText('2 conflicts')
  await expect(sync).toContainText('3 items waiting to arrive.')
  await expect(panel).toContainText('Windows pending14')
})

test('a pending and an errored cloud upload are never shown as verified', async ({ page }) => {
  const { panel, serve, refresh } = await openSystem(page, ok(reportWith({
    backup_cloud: { upload_state: 'uploading', verified_checkpoint_time: '2026-10-17T07:25:23Z' },
  })))
  const backups = panel.getByRole('region', { name: 'Backups' })
  await expect(backups).toContainText('Uploading')
  await expect(backups).toContainText('Last verified checkpoint 1d ago.')
  serve(ok(reportWith({ backup_cloud: { upload_errors: 1 } })))
  await refresh()
  await expect(backups).toContainText('Upload failed')
  await expect(panel.getByRole('status')).toContainText('Needs attention')
})

test('missing, unreadable and stale reports are stated plainly', async ({ page }) => {
  const { panel, serve, refresh } = await openSystem(page, { status: 200, json: { status: 'missing', readAt: NOW.toISOString(), error: 'not yet' } })
  await expect(panel).toContainText('No report yet')
  serve(failed)
  await refresh()
  await expect(panel).toContainText('Cortex could not read the protection report.')
  serve(ok(healthyReport(), 3 * 3600))
  await refresh()
  await expect(panel.getByRole('status')).toContainText('Report is stale')
  await expect(panel).not.toContainText('Protected')
})

test('the report is re-read once a minute and stops after leaving the page', async ({ page }) => {
  const { panel, reads, serve } = await openSystem(page, failed)
  await expect(panel).toContainText('Unavailable')
  const settled = reads()
  await page.clock.runFor(30_000)
  expect(reads()).toBe(settled)
  serve(ok(healthyReport()))
  await page.clock.runFor(31_000)
  await expect(panel.getByRole('status')).toContainText('Protected')
  expect(reads()).toBe(settled + 1)
  await page.goto('/#/settings')
  await page.clock.runFor(180_000)
  expect(reads()).toBe(settled + 1)
})
