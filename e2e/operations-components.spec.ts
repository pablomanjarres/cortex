import { test, expect, mockStores } from './fixtures'

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

const automationRuns = () => ({
  runs: [
    { id: 'recent', taskName: 'infra-health', timestamp: hoursAgo(1), status: 'success', summary: 'Health checks passed', fullOutput: '# Infra report' },
    { id: 'pending', taskName: 'content-draft-queue', timestamp: hoursAgo(48), status: 'pending-approval', summary: 'Drafts ready for review', fullOutput: '# Draft queue' },
    { id: 'older', taskName: 'backup-projects', timestamp: hoursAgo(72), status: 'error', summary: 'Backup target offline', fullOutput: '# Backup failed' },
  ],
})

test('automation run cards open their report from every list with the keyboard', async ({ page }) => {
  await mockStores(page, { 'cortex-automations': automationRuns() })
  await page.goto('/#/automations')

  const pending = page.getByRole('button', { name: /Drafts ready for review/ })
  await pending.focus()
  await pending.press('Enter')
  await expect(page.getByRole('heading', { name: 'content-draft-queue' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to tasks' }).click()

  const recent = page.getByRole('button', { name: /Health checks passed/ })
  await recent.focus()
  await recent.press('Space')
  await expect(page.getByRole('heading', { name: 'Infra report' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to tasks' }).click()

  const history = page.getByRole('button', { name: 'History for backup-projects' })
  await history.focus()
  await history.press('Enter')
  await expect(page.getByText('Task history')).toBeVisible()
  const historyRun = page.getByRole('button', { name: /Backup target offline/ })
  await historyRun.focus()
  await historyRun.press('Enter')
  await expect(page.getByRole('heading', { name: 'Backup failed' })).toBeVisible()
  // A run opened from history returns to that history first.
  await page.getByRole('button', { name: 'Back to tasks' }).click()
  await expect(page.getByText('Task history')).toBeVisible()
  await page.getByRole('button', { name: 'Back to tasks' }).click()

  await page.getByRole('button', { name: 'Read infra-health report' }).click()
  await expect(page.getByRole('heading', { name: 'Infra report' })).toBeVisible()
})

const opportunity = {
  id: 'opp-fixture', title: 'Fixture Fellowship', host: 'Fixture Org', category: 'fellowship', goals: [],
  priority: 'medium', leverageScore: 3, leverageNote: '', status: 'new', deadline: null, rolling: false,
  location: 'Remote', eligibility: 'unknown', reward: '', url: '', source: 'catalog', sourceRef: '',
  discoveredAt: '2026-10-01T12:00:00Z', runId: 'run-1', notes: '', tags: ['remote'],
}

type StoredOpportunity = typeof opportunity & { deadlineType?: string; requires18Plus?: boolean | null }
const storedItem = (stores: Record<string, unknown>) =>
  (stores['cortex-opportunities'] as { items: StoredOpportunity[] }).items[0]

test('opportunity editor keeps typed commas and writes labelled fields', async ({ page }) => {
  const backend = await mockStores(page, {
    'cortex-opportunities': { items: [opportunity], lastRun: '2026-10-20T12:00:00Z', lastRunId: 'run-1', report: 'Fixture report' },
  })
  await page.goto('/#/opportunities')
  await page.getByText('Fixture Fellowship', { exact: true }).first().click()

  const tags = page.getByLabel('Tags (comma-separated)', { exact: true })
  await tags.click()
  await tags.press('End')
  await tags.pressSequentially(', ai,')
  await expect(tags).toHaveValue('remote, ai,')
  await tags.pressSequentially(' latam')
  await tags.press('Enter')
  await expect.poll(() => storedItem(backend.stores).tags).toEqual(['remote', 'ai', 'latam'])
  await expect(tags).toHaveValue('remote, ai, latam')

  await page.getByLabel('Host', { exact: true }).fill('Renamed Org')
  await expect.poll(() => storedItem(backend.stores).host).toBe('Renamed Org')

  await page.getByLabel('Deadline type', { exact: true }).selectOption('always-open')
  await expect.poll(() => storedItem(backend.stores)).toMatchObject({ deadlineType: 'always-open', rolling: true })

  await page.getByLabel('Age rule', { exact: true }).selectOption('no')
  await expect.poll(() => storedItem(backend.stores).requires18Plus).toBe(false)
  // Radar-owned provenance stays untouched by user edits.
  expect(storedItem(backend.stores)).toMatchObject({ source: 'catalog', runId: 'run-1' })
})

test('top picks open the editor from the keyboard', async ({ page }) => {
  await mockStores(page, {
    'cortex-opportunities': { items: [opportunity], lastRun: '2026-10-20T12:00:00Z', lastRunId: 'run-1' },
  })
  await page.goto('/#/opportunities')
  const pick = page.getByRole('button', { name: 'Open top pick Fixture Fellowship', exact: true })
  await pick.focus()
  await pick.press('Enter')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Fixture Fellowship')
  const row = page.getByRole('button', { name: 'Details for Fixture Fellowship', exact: true })
  await row.focus()
  await row.press('Enter')
  await expect(row).toHaveAttribute('aria-expanded', 'false')
  await row.press('Space')
  await expect(row).toHaveAttribute('aria-expanded', 'true')
})
