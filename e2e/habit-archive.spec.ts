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
