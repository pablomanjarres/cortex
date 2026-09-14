import { test, expect, mockStores } from './fixtures'

test('a restored sprint keeps edits, duration and remaining time across pause/resume', async ({ page }) => {
  const now = new Date('2026-09-15T15:00:00Z')
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  const backend = await mockStores(page, {
    'cortex-active-sprint': {
      task: 'Saved task', startedAt: '2026-09-15T14:59:00Z',
      endTimeMs: now.getTime(), duration: 1, isPaused: true, pausedTimeLeft: 60,
    },
    'cortex-daily-sessions-2026-09-15': [],
  })
  await page.goto('/#/daily')
  const task = page.getByPlaceholder('What are you working on?')
  await expect.poll(async () => { await page.clock.runFor(1000); return task.count() }).toBe(1)
  await expect(task).toHaveValue('Saved task')
  await task.fill('Edited task')
  await page.getByRole('button', { name: 'Start sprint', exact: true }).click()
  await page.clock.runFor(10_000)
  await page.getByRole('button', { name: 'Pause sprint', exact: true }).click()
  await page.clock.runFor(20_000)
  await expect.poll(() => backend.stores['cortex-active-sprint']).toMatchObject({
    task: 'Edited task', duration: 1, isPaused: true, pausedTimeLeft: 50,
  })
  await task.fill('Final task')
  await page.getByRole('button', { name: 'Start sprint', exact: true }).click()
  await page.clock.runFor(1000)
  await expect.poll(() => backend.stores['cortex-active-sprint']).toMatchObject({
    task: 'Final task', duration: 1, isPaused: false,
  })
})

test('midnight completion logs once to the start day and clears the timer', async ({ page }) => {
  const now = new Date('2026-09-16T04:59:59Z')
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  const backend = await mockStores(page, {
    'cortex-active-sprint': {
      task: 'Cross midnight', startedAt: '2026-09-16T04:59:00Z',
      endTimeMs: now.getTime() + 3000, duration: 1, isPaused: false, pausedTimeLeft: 0,
    },
    'cortex-daily-sessions-2026-09-15': [],
    'cortex-daily-sessions-2026-09-16': [],
  })
  await page.goto('/#/daily')
  await expect.poll(async () => {
    await page.clock.runFor(50)
    return page.getByRole('button', { name: 'Pause sprint', exact: true }).count()
  }).toBe(1)
  await expect(page.getByRole('button', { name: 'Pause sprint', exact: true })).toBeVisible()
  await page.clock.runFor(4000)
  await expect.poll(() => backend.stores['cortex-active-sprint']).toBeNull()
  await expect.poll(() => backend.stores['cortex-daily-sessions-2026-09-15']).toEqual([
    expect.objectContaining({ task: 'Cross midnight', duration: 1, startedAt: '2026-09-16T04:59:00Z' }),
  ])
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.clock.runFor(3000)
  expect(backend.stores['cortex-daily-sessions-2026-09-15']).toHaveLength(1)
  expect(backend.stores['cortex-daily-sessions-2026-09-16']).toEqual([])
  await expect(page.getByRole('button', { name: 'Start sprint', exact: true })).toBeVisible()
})

test('notes formatting preserves the selection and saves from inline and fullscreen editors', async ({ page }) => {
  const backend = await mockStores(page, {
    'cortex-captures': [{ id: 'note-1', title: 'Format note', content: 'alpha beta gamma',
      source: 'other', url: '', imageIds: [], createdAt: '2026-09-15T15:00:00Z' }],
  })
  await page.goto('/#/library')
  await page.getByRole('tab', { name: 'Captures', exact: true }).click()
  await page.getByText('Format note', { exact: true }).click()
  await page.getByTitle('Edit inline', { exact: true }).click()
  const inline = page.getByPlaceholder('Click to write notes… (Markdown, or paste rich text)')
  await inline.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 10))
  await page.getByTitle('Bold', { exact: true }).click()
  await expect(inline).toHaveValue('alpha **beta** gamma')
  await expect.poll(() => inline.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([8, 12])
  await page.getByTitle('Fullscreen', { exact: true }).click()
  const fullscreen = page.locator('textarea').last()
  await expect(fullscreen).toHaveValue('alpha **beta** gamma')
  await fullscreen.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(8, 12))
  await page.getByTitle('Italic', { exact: true }).last().click()
  await expect(fullscreen).toHaveValue('alpha ***beta*** gamma')
  await expect.poll(() => backend.stores['cortex-captures']).toEqual([
    expect.objectContaining({ id: 'note-1', content: 'alpha ***beta*** gamma' }),
  ])
})
