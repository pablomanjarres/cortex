import { test, expect, mockStores } from './fixtures'

test('archive keeps the habit and history, removes it from active tracking, and allows reactivation', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-19T15:00:00Z'))
  const habit = { id: 'swim', name: 'Swimming', emoji: 'S', weeklyGoal: 3, category: 'Health', context: 'Pool opens soon' }
  const history = { '2026-09-19': { swim: true } }
  const backend = await mockStores(page, {
    'cortex-habits': [habit],
    'cortex-habits-history': history,
  })

  await page.goto('/#/habits')
  await expect(page.getByRole('button', { name: 'Swimming — Sat', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Move habit to on hold', exact: true }).first().click()

  await expect(page.getByRole('button', { name: 'Swimming — Sat', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Activate habit', exact: true }).first()).toBeVisible()
  await expect.poll(() => backend.stores['cortex-habits']).toContainEqual({ ...habit, onHold: true })
  expect(backend.stores['cortex-habits-history']).toEqual(history)

  await page.getByRole('tab', { name: 'Stats', exact: true }).click()
  await expect(page.getByText('0/0', { exact: true }).first()).toBeVisible()
  await page.getByRole('tab', { name: 'Habits', exact: true }).click()
  await page.getByRole('button', { name: 'Activate habit', exact: true }).first().click()

  await expect(page.getByRole('button', { name: 'Swimming — Sat', exact: true })).toBeVisible()
  await expect.poll(() => backend.stores['cortex-habits']).toContainEqual({ ...habit, onHold: false })
  expect(backend.stores['cortex-habits-history']).toEqual(history)
})

test('weekly audit excludes held habits and their old completions', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-21T15:00:00Z'))
  const history = Object.fromEntries(
    ['14', '15', '16', '17', '18', '19', '20'].map((day) => [
      `2026-09-${day}`,
      { held: true, ...(day === '14' ? { active: true } : {}) },
    ]),
  )
  const backend = await mockStores(page, {
    'cortex-habits': [
      { id: 'active', name: 'Walk', emoji: 'W', weeklyGoal: 7 },
      { id: 'held', name: 'Swim', emoji: 'S', weeklyGoal: 7, onHold: true },
    ],
    'cortex-habits-history': history,
  })

  await page.goto('/#/daily')
  await expect.poll(() => {
    const audit = backend.writes.find(({ key }) => key.startsWith('cortex-weekly-audit-'))?.data
    return (audit as { habitStats?: { consistency: number } } | undefined)?.habitStats?.consistency
  }).toBe(14)
})

test('Stats counts only active habits while retaining held history', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-19T15:00:00Z'))
  await mockStores(page, {
    'cortex-habits': [
      { id: 'active', name: 'Walk', emoji: 'W', weeklyGoal: 7 },
      { id: 'held', name: 'Swim', emoji: 'S', weeklyGoal: 7, onHold: true },
    ],
    'cortex-habits-history': { '2026-09-19': { held: true } },
  })

  await page.goto('/#/habits')
  await page.getByRole('tab', { name: 'Stats', exact: true }).click()
  await expect(page.getByText('0/1', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('S Swim', { exact: true })).toHaveCount(0)
})

test('Today shortcuts remain usable before the habits key has been created', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-19T15:00:00Z'))
  const backend = await mockStores(page)

  await page.goto('/#/daily')
  await page.getByRole('button', { name: 'Workout', exact: true }).click()

  await expect.poll(() => backend.stores['cortex-habits-history']).toEqual({
    '2026-09-19': { '1': true },
  })
})

test('all seven habit days stay inside a 320-pixel phone card', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await mockStores(page, {
    'cortex-habits': [{ id: 'swim', name: 'Swimming', emoji: 'S', weeklyGoal: 3 }],
  })

  await page.goto('/#/habits')
  const card = page.locator('.surface.rounded-xl.p-4').filter({ hasText: 'Swimming' }).first()
  const cardBox = await card.boundingBox()
  const sundayBox = await page.getByRole('button', { name: 'Swimming — Sun' }).boundingBox()
  expect(cardBox).not.toBeNull()
  expect(sundayBox).not.toBeNull()
  expect(sundayBox!.x + sundayBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width - 1)
})

test('a stale client displays the server-confirmed habit completion', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-19T15:00:00Z'))
  const backend = await mockStores(page, {}, {
    canonicalizeWrite: (key, data) => key === 'cortex-habits-history'
      ? { '2026-09-19': {} }
      : data,
  })

  await page.goto('/#/daily')
  const workout = page.getByRole('button', { name: 'Workout', exact: true })
  await expect(workout).toHaveAttribute('aria-pressed', 'false')
  backend.set('cortex-habits', [{ id: '1', name: 'Workout', emoji: '💪', onHold: true }])
  await workout.click()

  await expect.poll(() => backend.writes.some(({ key }) => key === 'cortex-habits-history')).toBe(true)
  await expect(workout).toHaveAttribute('aria-pressed', 'false', { timeout: 1000 })
  expect(backend.stores['cortex-habits-history']).toEqual({ '2026-09-19': {} })
})
