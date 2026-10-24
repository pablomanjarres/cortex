import { test, expect, mockStores } from './fixtures'

const stat = { avg: 12, min: 4, max: 30 }

function history(windowKey: string, count: number) {
  return {
    host: 'mac',
    windowMs: 3_600_000,
    count,
    samples: Array.from({ length: count }, (_, index) => ({
      t: Date.UTC(2026, 9, 23, 12, index), cpu: 10, cpuMax: 20, mem: 40, memMax: 45, load1: 1, load1Max: 2, rxBps: 0, txBps: 0,
    })),
    stats: { cpu: stat, mem: stat, load1: stat, swap: stat },
    latest: { cores: 8 },
    window: windowKey,
  }
}

const glances = {
  system: { os_name: 'Darwin', hostname: 'fixture-host', platform: 'arm64', os_version: '25.6', hr_name: 'macOS' },
  core: { phys: 8, log: 8 },
  cpu: { total: 12.5, user: 8, system: 4, idle: 87 },
  mem: { total: 16e9, used: 8e9, free: 8e9, available: 8e9, percent: 50 },
  load: { min1: 1.2, min5: 1, min15: 0.8, cpucore: 8 },
  uptime: '3 days',
  fs: [],
  network: [],
  processcount: { total: 400, running: 2, sleeping: 398, thread: 2000 },
  processlist: [],
}

test('theme and calendar views are exclusive pressed choices', async ({ page }) => {
  await mockStores(page)
  await page.goto('/#/settings')
  const theme = page.getByRole('group', { name: 'Appearance theme' })
  await theme.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(theme.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(theme.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

  await page.goto('/#/calendar')
  const view = page.getByRole('group', { name: 'Calendar view' })
  await view.getByRole('button', { name: 'Day', exact: true }).click()
  await expect(view.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(view.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('system history refetches its window and never shows the previous window as current', async ({ page }) => {
  await mockStores(page)
  const counts: Record<string, number> = { '1h': 2, '6h': 5 }
  const requested: string[] = []
  let releaseSixHours = () => {}
  const sixHoursHeld = new Promise<void>((resolve) => { releaseSixHours = resolve })
  await page.route('**/api/system/mac', (route) => route.fulfill({ json: glances }))
  await page.route('**/api/system/history**', async (route) => {
    const windowKey = new URL(route.request().url()).searchParams.get('window') ?? ''
    requested.push(windowKey)
    if (windowKey === '6h') await sixHoursHeld
    await route.fulfill({ json: history(windowKey, counts[windowKey] ?? 0) })
  })

  await page.goto('/#/system')
  await expect(page.getByRole('heading', { name: 'Mac mini' })).toBeVisible()
  await expect(page.getByText('· 2 samples')).toBeVisible()

  await page.getByRole('button', { name: '6h', exact: true }).click()
  await expect(page.getByText('· 2 samples')).toHaveCount(0)
  releaseSixHours()
  await expect(page.getByText('· 5 samples')).toBeVisible()
  expect(requested).toContain('6h')
})
