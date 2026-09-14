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

test('switching workouts ignores a late previous-session lookup from the old workout', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T12:00:00-05:00'))
  const exercises = [{ id: 'press', name: 'Bench Press', sets: 1, repsRange: '8', startWeight: '10', notes: '' }]
  const active = (workoutDayId: string) => ({
    workoutDayId, startedAt: '2026-09-14T12:00:00-05:00', currentExerciseIndex: 0, currentSetIndex: 0,
    exerciseLogs: [{ exerciseId: 'press', exerciseName: 'Bench Press', sets: [{ weight: 10, reps: 8, completed: false }] }],
    restTimerEnd: null, restDuration: 90, isResting: false,
  })
  const previous = (date: string, workoutDayId: string, weight: number) => ({
    date, workoutDayId, workoutName: workoutDayId, startedAt: `${date}T12:00:00-05:00`, completedFully: true,
    exercises: [{ exerciseId: 'press', exerciseName: 'Bench Press', sets: [{ weight, reps: 8, completed: true }] }],
  })
  const backend = await mockStores(page, {
    'cortex-gym-plans': ['push', 'pull'].map(id => ({ id, name: id.toUpperCase(), dayOfWeek: 'Monday', time: '', exercises })),
    'cortex-gym-active': active('push'),
    'cortex-gym-session-2026-09-13': [previous('2026-09-13', 'pull', 70)],
    'cortex-gym-session-2026-09-12': previous('2026-09-12', 'push', 40),
  })
  let releaseRead = () => {}
  const holdRead = new Promise<void>(resolve => { releaseRead = resolve })
  let oldWorkoutRequested = false
  await page.route('**/api/data?key=cortex-gym-session-2026-09-12', async route => {
    oldWorkoutRequested = true
    await holdRead
    await route.fallback()
  })
  try {
    await page.goto('/#/gym')
    await expect.poll(() => oldWorkoutRequested).toBe(true)
    backend.set('cortex-gym-active', active('pull'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByText('last: 70kg × 8', { exact: true })).toBeVisible()
    const lateResponse = page.waitForResponse(response => response.url().endsWith('/api/data?key=cortex-gym-session-2026-09-12'))
    releaseRead()
    await (await lateResponse).finished()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.getByText('last: 70kg × 8', { exact: true })).toBeVisible()
    await expect(page.getByText('last: 40kg × 8', { exact: true })).toHaveCount(0)
  } finally {
    releaseRead()
  }
})

test('exercise previews recover from failed media when the exercise name changes', async ({ page }) => {
  const plan = (name: string) => [{ id: 'push', name: 'PUSH', dayOfWeek: 'Monday', time: '', exercises: [
    { id: 'exercise', name, sets: 1, repsRange: '8', startWeight: '10', notes: '' },
  ] }]
  const backend = await mockStores(page, { 'cortex-gym-plans': plan('Bench Press') })
  await page.route('**/free-exercise-db@main/dist/exercises.json', route => route.fulfill({ json: [
    { name: 'Bench Press', images: ['bench.jpg'], primaryMuscles: ['chest'] },
    { name: 'Squat', images: ['squat.jpg'], primaryMuscles: ['quadriceps'] },
  ] }))
  let failedImageRequested = false
  await page.route('**/free-exercise-db@main/exercises/bench.jpg', route => {
    failedImageRequested = true
    return route.abort()
  })
  await page.route('**/free-exercise-db@main/exercises/squat.jpg', route => route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>',
  }))
  await page.goto('/#/gym')
  await expect.poll(() => failedImageRequested).toBe(true)
  await expect(page.getByRole('button', { name: 'Preview Bench Press' }).locator('img')).toHaveCount(0)
  backend.set('cortex-gym-plans', plan('Squat'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  const image = page.getByRole('button', { name: 'Preview Squat' }).getByRole('img', { name: 'Squat' })
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
})
