import { test, expect, mockStores } from './fixtures'

const savedWorkout = {
  workoutDayId: 'saved', startedAt: '2026-10-06T18:00:00Z', currentExerciseIndex: 0, currentSetIndex: 1,
  exerciseLogs: [{ exerciseId: 'press', exerciseName: 'Saved press', sets: [{ weight: 15, reps: 8, completed: true }, { weight: 17.5, reps: 9, completed: false }] }],
  restTimerEnd: null, restDuration: 90, isResting: false,
}

test('a cold bookmark launch restores the active exercise instead of Home', async ({ page }) => {
  await mockStores(page, { 'cortex-gym-plans': [], 'cortex-gym-active': savedWorkout })
  await page.goto('/')
  await expect(page).toHaveURL(/#\/gym$/)
  await expect(page.getByRole('textbox', { name: 'Weight (kg)', exact: true })).toHaveValue('17.5')
  await expect(page.getByRole('region', { name: 'Current set 2', exact: true })).toBeVisible()
  await page.goto('/#/daily')
  await page.goto('/')
  await expect(page).toHaveURL(/#\/gym$/)
  await expect(page.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('9')
})

test('without an active workout reopening keeps the last visited page', async ({ page }) => {
  await mockStores(page)
  await page.goto('/#/gym')
  await expect(page.getByRole('tab', { name: 'Training', exact: true })).toBeVisible()
  await page.goto('/')
  await expect(page).toHaveURL(/#\/gym$/)
})

test('pagehide flushes an edit before the debounce timer can run', async ({ page }) => {
  const backend = await mockStores(page, { 'cortex-gym-plans': [], 'cortex-gym-active': savedWorkout })
  await page.clock.install({ time: new Date('2026-10-06T18:00:00Z') })
  await page.goto('/#/gym')
  await expect(page.getByRole('textbox', { name: 'Weight (kg)', exact: true })).toHaveValue('17.5')
  await page.clock.pauseAt(new Date('2026-10-06T18:05:00Z'))
  await page.getByRole('textbox', { name: 'Weight (kg)', exact: true }).fill('19.5')
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
  await expect.poll(() => (backend.stores['cortex-gym-active'] as typeof savedWorkout).exerciseLogs[0].sets[1].weight).toBe(19.5)
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Weight (kg)', exact: true })).toHaveValue('19.5')
})
