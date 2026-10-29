import type { Page, Route } from '@playwright/test'
import { test, expect, mockStores } from './fixtures'

type HostKey = 'mac' | 'laptop-w'
interface HostState { host: HostKey; label: string; enabled: boolean | null; available: boolean; error?: string }

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

function hostsFixture(overrides: Partial<Record<HostKey, Partial<HostState>>> = {}): Record<HostKey, HostState> {
  return {
    mac: { host: 'mac', label: 'Mac', enabled: false, available: true, ...overrides.mac },
    'laptop-w': { host: 'laptop-w', label: 'laptop-w', enabled: false, available: true, ...overrides['laptop-w'] },
  }
}

interface BlackoutMock {
  hosts: Record<HostKey, HostState>
  writes: { host: HostKey; enabled: boolean }[]
  /** Replaces the default POST handler; return true when the route was handled. */
  onWrite?: (route: Route, body: { host: HostKey; enabled: boolean }) => Promise<boolean>
  getFails?: boolean
  /** Snapshots status when the GET arrives but answers only once this settles. */
  holdGet?: Promise<void>
}

async function mockSystem(page: Page, hosts = hostsFixture()): Promise<BlackoutMock> {
  await mockStores(page)
  const mock: BlackoutMock = { hosts, writes: [] }
  await page.route('**/api/system/mac', (route) => route.fulfill({ json: glances }))
  await page.route('**/api/system/history**', (route) => route.fulfill({ json: { host: 'mac', samples: [], stats: {}, latest: {} } }))
  await page.route('**/api/system/blackout', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      if (mock.getFails) return route.fulfill({ status: 503, json: { error: 'unavailable' } })
      const snapshot = structuredClone(Object.values(mock.hosts))
      if (mock.holdGet) await mock.holdGet
      // The page may have cancelled a superseded poll.
      return route.fulfill({ json: { hosts: snapshot } }).catch(() => {})
    }
    const body = request.postDataJSON() as { host: HostKey; enabled: boolean }
    mock.writes.push(body)
    if (mock.onWrite && await mock.onWrite(route, body)) return
    mock.hosts[body.host] = { ...mock.hosts[body.host], enabled: body.enabled }
    return route.fulfill({ json: mock.hosts[body.host] })
  })
  return mock
}

function card(page: Page) {
  return page.getByRole('region', { name: 'Screen blackout' })
}

test('turns a host overlay on and off only after the server confirms it', async ({ page }) => {
  const mock = await mockSystem(page)
  let release = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  mock.onWrite = async (route, body) => {
    if (!body.enabled) return false
    await held
    mock.hosts[body.host] = { ...mock.hosts[body.host], enabled: true }
    await route.fulfill({ json: mock.hosts[body.host] })
    return true
  }
  await page.goto('/#/system')

  const mac = card(page).getByRole('switch', { name: 'Mac' })
  const laptop = card(page).getByRole('switch', { name: 'laptop-w' })
  await expect(mac).not.toBeChecked()
  await expect(mac).toBeEnabled()

  await mac.click()
  await expect.poll(() => mock.writes).toEqual([{ host: 'mac', enabled: true }])
  // No optimistic flip: still off and locked while the write is verified.
  await expect(mac).not.toBeChecked()
  await expect(mac).toBeDisabled()
  await expect(card(page).getByText('Turning on…')).toBeVisible()
  // The other host stays independent.
  await expect(laptop).toBeEnabled()

  release()
  await expect(mac).toBeChecked()
  await expect(mac).toBeEnabled()
  await expect(laptop).not.toBeChecked()

  await mac.click()
  await expect(mac).not.toBeChecked()
  expect(mock.writes).toEqual([{ host: 'mac', enabled: true }, { host: 'mac', enabled: false }])
})

test('a failed write shows the verified state, an error, and a working retry', async ({ page }) => {
  const mock = await mockSystem(page)
  let failNext = true
  mock.onWrite = async (route, body) => {
    if (!failNext) return false
    failNext = false
    // The overlay actually came up even though the request failed.
    mock.hosts[body.host] = { ...mock.hosts[body.host], enabled: true }
    await route.fulfill({ status: 500, json: { error: 'Overlay could not be verified' } })
    return true
  }
  await page.goto('/#/system')

  const laptop = card(page).getByRole('switch', { name: 'laptop-w' })
  await laptop.click()

  const alert = card(page).getByRole('alert')
  await expect(alert).toContainText('Overlay could not be verified')
  // Reconciled from the server, not left at the requested value or reverted blindly.
  await expect(laptop).toBeChecked()
  await expect(laptop).toBeEnabled()

  // Turning it off is allowed once reconciled.
  await laptop.click()
  await expect(laptop).not.toBeChecked()
  await expect(alert).toHaveCount(0)
  expect(mock.writes).toEqual([{ host: 'laptop-w', enabled: true }, { host: 'laptop-w', enabled: false }])

  // A failure that leaves the host unchanged offers a retry of the same request.
  mock.onWrite = async (route) => {
    mock.onWrite = undefined
    await route.fulfill({ status: 502, json: { error: 'Agent timed out' } })
    return true
  }
  await laptop.click()
  await expect(card(page).getByRole('alert')).toContainText('Agent timed out')
  await expect(laptop).not.toBeChecked()
  await card(page).getByRole('button', { name: 'Retry laptop-w' }).click()
  await expect(laptop).toBeChecked()
  await expect(card(page).getByRole('alert')).toHaveCount(0)
  expect(mock.writes.at(-1)).toEqual({ host: 'laptop-w', enabled: true })
})

test('the switch works from the keyboard', async ({ page }) => {
  const mock = await mockSystem(page)
  await page.goto('/#/system')

  const mac = card(page).getByRole('switch', { name: 'Mac' })
  await expect(mac).toBeEnabled()
  await mac.focus()
  await expect(mac).toBeFocused()
  await page.keyboard.press('Space')
  await expect(mac).toBeChecked()
  await expect(mac).toBeFocused()
  await page.keyboard.press('Space')
  await expect(mac).not.toBeChecked()
  expect(mock.writes).toEqual([{ host: 'mac', enabled: true }, { host: 'mac', enabled: false }])
})

test('an unreachable or unknown host cannot be written', async ({ page }) => {
  const mock = await mockSystem(page, hostsFixture({
    'laptop-w': { enabled: null, available: false, error: 'laptop-w is unreachable' },
  }))
  await page.goto('/#/system')

  const mac = card(page).getByRole('switch', { name: 'Mac' })
  const laptop = card(page).getByRole('switch', { name: 'laptop-w' })
  await expect(mac).toBeEnabled()
  await expect(laptop).toBeDisabled()
  await expect(card(page).getByText('laptop-w is unreachable')).toBeVisible()
  await expect(card(page).getByText('Unavailable')).toBeVisible()

  await laptop.click({ force: true })
  await laptop.focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  expect(mock.writes).toEqual([])
})

test('when status cannot be loaded, switches stay locked and a retry recovers', async ({ page }) => {
  const mock = await mockSystem(page)
  mock.getFails = true
  await page.goto('/#/system')

  await expect(card(page).getByRole('alert')).toContainText('Couldn’t load blackout status: unavailable')
  const mac = card(page).getByRole('switch', { name: 'Mac' })
  await expect(mac).toHaveCount(0)

  mock.getFails = false
  mock.hosts.mac.enabled = true
  await card(page).getByRole('button', { name: 'Retry status' }).click()
  await expect(mac).toBeChecked()
  await expect(mac).toBeEnabled()
  expect(mock.writes).toEqual([])
})

test('malformed status never becomes an actionable switch', async ({ page }) => {
  await mockSystem(page)
  await page.route('**/api/system/blackout', route => route.fulfill({ json: { hosts: [
    { host: 'mac', label: 'Mac', enabled: 'true', available: true },
    { host: 'laptop-w', label: 'laptop-w', enabled: false, available: true },
  ] } }))
  await page.goto('/#/system')
  await expect(card(page).getByRole('alert')).toContainText('Unexpected blackout status response')
  await expect(card(page).getByRole('switch')).toHaveCount(0)
})

test('an invalid confirmation locks the host until a fresh status read completes', async ({ page }) => {
  const mock = await mockSystem(page)
  let release = () => {}
  mock.onWrite = async (route) => {
    mock.holdGet = new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: { host: 'laptop-w', label: 'laptop-w', enabled: true, available: true } })
    return true
  }
  await page.goto('/#/system')
  const mac = card(page).getByRole('switch', { name: 'Mac' })
  await expect(mac).toBeEnabled()
  await mac.click()
  await expect(card(page).getByRole('alert')).toContainText('Screen change could not be verified')
  await expect(mac).toBeDisabled()
  await expect(card(page).getByRole('button', { name: 'Retry Mac' })).toBeDisabled()
  release()
  await expect(mac).toBeEnabled()
  await expect(mac).not.toBeChecked()
  expect(mock.writes).toEqual([{ host: 'mac', enabled: true }])
})

test('a poll that started before a write never overrides the verified result', async ({ page }) => {
  await page.clock.install()
  const mock = await mockSystem(page)
  await page.goto('/#/system')
  const mac = card(page).getByRole('switch', { name: 'Mac' })
  await expect(mac).toBeEnabled()

  let releaseGet = () => {}
  mock.holdGet = new Promise<void>((resolve) => { releaseGet = resolve })
  const pollStarted = page.waitForRequest((request) => request.url().endsWith('/api/system/blackout') && request.method() === 'GET')
  await page.clock.runFor(16_000)
  await pollStarted

  // The held poll read "off"; the write then verifies "on" before that poll answers.
  await mac.click()
  await expect(mac).toBeChecked()
  mock.holdGet = undefined
  releaseGet()
  // Give a stale answer time to reach the page before checking it was ignored.
  await page.waitForTimeout(500)
  await page.clock.runFor(100)
  await expect(mac).toBeChecked()

  // Later polls still run and agree with the verified state.
  const nextPoll = page.waitForRequest((request) => request.url().endsWith('/api/system/blackout') && request.method() === 'GET')
  await page.clock.runFor(16_000)
  await nextPoll
  await expect(mac).toBeChecked()
  expect(mock.writes).toEqual([{ host: 'mac', enabled: true }])
})

test('a poll that runs during a write cannot undo it when it answers late', async ({ page }) => {
  await page.clock.install()
  const mock = await mockSystem(page)
  let releaseWrite = () => {}
  const writeHeld = new Promise<void>((resolve) => { releaseWrite = resolve })
  mock.onWrite = async (route, body) => {
    await writeHeld
    mock.hosts[body.host] = { ...mock.hosts[body.host], enabled: body.enabled }
    await route.fulfill({ json: mock.hosts[body.host] })
    return true
  }
  await page.goto('/#/system')
  const mac = card(page).getByRole('switch', { name: 'Mac' })
  await expect(mac).toBeEnabled()

  await mac.click()
  await expect.poll(() => mock.writes.length).toBe(1)
  let releaseGet = () => {}
  mock.holdGet = new Promise<void>((resolve) => { releaseGet = resolve })
  const pollStarted = page.waitForRequest((request) => request.url().endsWith('/api/system/blackout') && request.method() === 'GET')
  await page.clock.runFor(16_000)
  await pollStarted

  releaseWrite()
  await expect(mac).toBeChecked()
  mock.holdGet = undefined
  releaseGet()
  await page.waitForTimeout(500)
  await page.clock.runFor(100)
  await expect(mac).toBeChecked()
})

test('a failed poll locks every switch until status is current again', async ({ page }) => {
  await page.clock.install()
  const mock = await mockSystem(page)
  await page.goto('/#/system')
  const mac = card(page).getByRole('switch', { name: 'Mac' })
  await expect(mac).toBeEnabled()

  mock.getFails = true
  await page.clock.runFor(16_000)
  await expect(card(page).getByRole('alert')).toContainText('Status is out of date')
  await expect(mac).toBeDisabled()
  await expect(card(page).getByRole('switch', { name: 'laptop-w' })).toBeDisabled()

  mock.getFails = false
  await card(page).getByRole('button', { name: 'Retry status' }).click()
  await expect(mac).toBeEnabled()
  await expect(card(page).getByRole('alert')).toHaveCount(0)
  expect(mock.writes).toEqual([])
})

test('fits a 390px screen without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSystem(page, hostsFixture({ 'laptop-w': { enabled: null, available: false, error: 'laptop-w is unreachable' } }))
  await page.goto('/#/system')
  const region = card(page)
  await expect(region.getByRole('switch', { name: 'Mac' })).toBeEnabled()
  const box = await region.boundingBox()
  expect(box && box.x + box.width).toBeLessThanOrEqual(390)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const mac = await region.getByRole('switch', { name: 'Mac' }).boundingBox()
  expect(mac?.height ?? 0).toBeGreaterThanOrEqual(24)
})
