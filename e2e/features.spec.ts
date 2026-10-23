import { test, expect, mockStores } from './fixtures'

const session = (task: string) => ({ id: task, task, duration: 25, startedAt: '2026-09-14T12:00:00Z', completedAt: '2026-09-14T12:25:00Z' })

test('stats keep the selected date when an earlier request finishes late', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00Z'))
  await mockStores(page, {
    'cortex-daily-sessions-2026-09-14': [session('Today focus')],
    'cortex-daily-sessions-2026-09-13': [session('Yesterday focus')],
    'cortex-daily-sessions-2026-09-12': [session('Saturday focus')],
  })
  let requested = false
  let release: () => void = () => {}
  const hold = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/data?key=cortex-daily-sessions-2026-09-13', async (route) => {
    requested = true
    await hold
    await route.fulfill({ json: [session('Yesterday focus')], headers: { 'X-Cortex-Rev': '1' } })
  })
  await page.goto('/#/habits')
  await page.getByRole('tab', { name: 'Stats', exact: true }).click()
  await expect(page.getByText('Today focus', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Previous day', exact: true }).click()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Previous day', exact: true }).click()
  await expect(page.getByText('Saturday focus', { exact: true })).toBeVisible()
  const finished = page.waitForResponse((response) => response.url().includes('key=cortex-daily-sessions-2026-09-13'))
  release()
  await finished
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(page.getByText('Saturday focus', { exact: true })).toBeVisible()
  await expect(page.getByText('Yesterday focus', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByText('Today focus', { exact: true })).toBeVisible()
})

test('captures migrate legacy images after the saved store loads', async ({ page }) => {
  const capture = { id: 'legacy', title: 'Saved capture', content: '', source: 'screenshot', url: '', imageId: 'legacy.png', createdAt: '2026-09-14T12:00:00Z' }
  const backend = await mockStores(page, { 'cortex-captures': [capture] })
  await page.route('**/api/media?*', (route) => route.fulfill({ json: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7hoAAAAASUVORK5CYII=' }))
  await page.goto('/#/library')
  await page.getByRole('tab', { name: 'Captures', exact: true }).click()
  await expect(page.getByText('Saved capture', { exact: true })).toBeVisible()
  await expect.poll(() => backend.stores['cortex-captures']).toEqual([
    { id: 'legacy', title: 'Saved capture', content: '', source: 'screenshot', url: '', imageIds: ['legacy.png'], createdAt: '2026-09-14T12:00:00Z' },
  ])
  expect(backend.writes.filter((write) => write.key === 'cortex-captures')).toHaveLength(1)
})

test('contact reminders update after the clock crosses a day', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-14T23:59:30Z') })
  await mockStores(page, {
    'cortex-contacts': [{ id: 'contact', name: 'Test contact', title: '', nickname: '', categories: [], fields: [], followUp: false, birthday: '', phone: '', lastContact: '2026-09-13', interval: 2, email: '', socialProfiles: '', address: '' }],
  })
  await page.goto('/#/social')
  await expect(page.getByText('All caught up.', { exact: true })).toBeVisible()
  await page.clock.fastForward(60_000)
  await expect(page.getByText('1d overdue', { exact: true })).toBeVisible()
})
