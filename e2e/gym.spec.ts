import { test, expect, mockStores } from './fixtures'
import type { DailyNutrition } from '../src/types/gym'

const nutritionDay = (date: string, waterLiters: number): DailyNutrition => ({
  date,
  meals: [
    { id: 'breakfast', name: 'Breakfast', foods: [] },
    { id: 'lunch', name: 'Lunch', foods: [] },
    { id: 'dinner', name: 'Dinner', foods: [] },
    { id: 'snack', name: 'Snack', foods: [] },
  ],
  waterLiters,
})

test('nutrition day changes reject stale reads and save only the selected day once', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T12:00:00-05:00'))
  const backend = await mockStores(page, {
    'cortex-gym-plans': [],
    'cortex-nutrition-2026-09-14': nutritionDay('2026-09-14', 2),
    'cortex-nutrition-2026-09-13': nutritionDay('2026-09-13', 1),
    'cortex-nutrition-2026-09-12': nutritionDay('2026-09-12', 3),
  })
  let releaseRead = () => {}
  const holdRead = new Promise<void>(resolve => { releaseRead = resolve })
  let yesterdayRequested = false
  await page.route('**/api/data?key=cortex-nutrition-2026-09-13', async route => {
    yesterdayRequested = true
    await holdRead
    await route.fallback()
  })
  try {
    await page.goto('/#/gym')
    await page.getByRole('tab', { name: 'Nutrition', exact: true }).click()
    await expect(page.getByText('2L / 2.5L', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Previous day', exact: true }).click()
    await expect.poll(() => yesterdayRequested).toBe(true)
    await page.getByRole('button', { name: 'Previous day', exact: true }).click()
    await expect(page.getByText('3L / 2.5L', { exact: true })).toBeVisible()

    const lateResponse = page.waitForResponse(response => response.url().endsWith('/api/data?key=cortex-nutrition-2026-09-13'))
    releaseRead()
    await (await lateResponse).finished()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.getByText('3L / 2.5L', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Add 0.25 liters', exact: true }).click()
    await expect.poll(() => (backend.stores['cortex-nutrition-2026-09-12'] as DailyNutrition).waterLiters).toBe(3.25)
    expect(backend.writes.filter(write => write.key.startsWith('cortex-nutrition-'))).toEqual([
      { key: 'cortex-nutrition-2026-09-12', data: nutritionDay('2026-09-12', 3.25) },
    ])
    expect(backend.stores['cortex-nutrition-2026-09-13']).toEqual(nutritionDay('2026-09-13', 1))
    expect(backend.stores['cortex-nutrition-2026-09-14']).toEqual(nutritionDay('2026-09-14', 2))
  } finally {
    releaseRead()
  }
})
