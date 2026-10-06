import { test, expect, mockStores } from './fixtures'
import type { Page } from '@playwright/test'

type Mode = 'supported' | 'unsupported' | 'insecure' | 'blocked' | 'pending'

async function setup(page: Page, mode: Mode = 'supported', swim = false) {
  await page.addInitScript(({ mode }) => {
    const sentinels: Sentinel[] = []
    const pending: (() => void)[] = []
    const state = {
      requests: 0, releases: 0, notificationRequests: 0, denied: mode === 'blocked',
      visible: 'visible',
      held: () => sentinels.filter((item) => !item.released).length,
      releaseActive: () => sentinels.forEach((item) => { if (!item.released) void item.release() }),
      resolvePending: () => pending.splice(0).forEach((resolve) => resolve()),
      setVisibility: (visible: string) => { state.visible = visible; document.dispatchEvent(new Event('visibilitychange')) },
    }
    class Sentinel extends EventTarget {
      released = false
      async release() {
        if (this.released) return
        this.released = true
        state.releases++
        this.dispatchEvent(new Event('release'))
      }
    }
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state.visible })
    if (mode === 'insecure') Object.defineProperty(window, 'isSecureContext', { value: false })
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: mode === 'unsupported' ? undefined : {
      request: async () => {
        state.requests++
        if (state.denied) throw new DOMException('Device policy prevents wake lock', 'NotAllowedError')
        const sentinel = new Sentinel()
        sentinels.push(sentinel)
        if (mode === 'pending') await new Promise<void>((resolve) => pending.push(resolve))
        return sentinel
      },
    } })
    if ('Notification' in window) {
      Object.defineProperty(Notification, 'requestPermission', { value: async () => { state.notificationRequests++; return 'denied' } })
    }
    ;(window as unknown as { __wake: typeof state }).__wake = state
  }, { mode })
  const backend = await mockStores(page, {
    'cortex-gym-plans': [{ id: 'day', name: swim ? 'SWIM' : 'Upper body', dayOfWeek: 'Tuesday', time: '1 PM',
      exercises: swim ? [] : [{ id: 'press', name: 'Press', sets: 2, repsRange: '8-12', startWeight: '20 kg', notes: '' }] }],
  })
  await page.goto('/#/gym')
  await page.getByRole('button', { name: swim ? 'Start swim' : 'Start workout', exact: true }).click()
  return backend
}

const held = (page: Page) => page.evaluate('window.__wake.held()')

test('active training keeps the screen awake and releases on toggle and finish', async ({ page }) => {
  await setup(page)
  await expect(page.getByText('Screen stays on', { exact: true })).toBeVisible()
  await expect.poll(() => held(page)).toBe(1)
  await page.getByText('Session options', { exact: true }).click()
  const toggle = page.getByRole('button', { name: 'Keep screen on', exact: true })
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => held(page)).toBe(0)
  await expect(page.getByText('Screen stays on', { exact: true })).toHaveCount(0)
  await toggle.click()
  await expect.poll(() => held(page)).toBe(1)
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect.poll(() => held(page)).toBe(0)
  expect(await page.evaluate('window.__wake.notificationRequests')).toBe(0)
})

test('returning to a visible workout reacquires screen control', async ({ page }) => {
  await setup(page)
  await expect.poll(() => held(page)).toBe(1)
  await page.evaluate("window.__wake.setVisibility('hidden')")
  await expect.poll(() => held(page)).toBe(0)
  await page.evaluate("window.__wake.setVisibility('visible')")
  await expect.poll(() => held(page)).toBe(1)
  await expect(page.getByText('Screen stays on', { exact: true })).toBeVisible()
})

test('a hidden page retains the rest deadline for the server until returning', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-06T18:00:00Z') })
  const backend = await setup(page)
  await page.getByRole('button', { name: 'Log set', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Skip rest', exact: true })).toBeVisible()
  await page.evaluate("window.__wake.setVisibility('hidden')")
  await page.clock.fastForward('02:00')
  await expect(page.getByRole('button', { name: 'Skip rest', exact: true })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
  await expect.poll(() => (backend.stores['cortex-gym-active'] as { isResting: boolean }).isResting).toBe(true)
  await page.evaluate("window.__wake.setVisibility('visible')")
  await expect(page.getByRole('button', { name: 'Skip rest', exact: true })).toHaveCount(0)
  await expect.poll(() => (backend.stores['cortex-gym-active'] as { isResting: boolean }).isResting).toBe(false)
})

test('a device release is reported and can be retried', async ({ page }) => {
  await setup(page)
  await expect.poll(() => held(page)).toBe(1)
  await page.evaluate('window.__wake.releaseActive()')
  await expect(page.getByText('Screen stays on', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Screen control paused', { exact: true })).toBeVisible()
  await page.getByText('Session options', { exact: true }).click()
  await page.getByRole('button', { name: 'Retry screen control', exact: true }).click()
  await expect.poll(() => held(page)).toBe(1)
})

test('a declined request is quiet and retry can recover', async ({ page }) => {
  await setup(page, 'blocked')
  await expect(page.getByText('Screen control paused', { exact: true })).toBeVisible()
  expect(await held(page)).toBe(0)
  await page.getByText('Session options', { exact: true }).click()
  await page.evaluate('window.__wake.denied = false')
  await page.getByRole('button', { name: 'Retry screen control', exact: true }).click()
  await expect.poll(() => held(page)).toBe(1)
})

for (const [mode, status] of [['unsupported', 'Screen control unavailable'], ['insecure', 'Screen control needs HTTPS']] as const) {
  test(`${mode} screen control never claims a held lock`, async ({ page }) => {
    await setup(page, mode)
    await expect(page.getByText(status, { exact: true })).toBeVisible()
    await expect(page.getByText('Screen stays on', { exact: true })).toHaveCount(0)
    expect(await page.evaluate('window.__wake.requests')).toBe(0)
  })
}

test('an in-flight request is released after the screen control is disabled', async ({ page }) => {
  await setup(page, 'pending')
  await expect(page.getByText('Requesting screen control', { exact: true })).toBeVisible()
  await page.getByText('Session options', { exact: true }).click()
  await page.getByRole('button', { name: 'Keep screen on', exact: true }).click()
  await page.evaluate('window.__wake.resolvePending()')
  await expect.poll(() => held(page)).toBe(0)
  await expect(page.getByText('Screen stays on', { exact: true })).toHaveCount(0)
})

test('swimming holds screen control only while the timer is active', async ({ page }) => {
  await setup(page, 'supported', true)
  await expect.poll(() => held(page)).toBe(1)
  await expect(page.getByText('Screen stays on', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop & log swim', exact: true }).click()
  await expect.poll(() => held(page)).toBe(0)
})
