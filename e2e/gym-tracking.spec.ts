import { test, expect, mockStores } from './fixtures'

const today = '2026-10-06'
const exercises = [
  { id: 'press', name: 'Incline dumbbell press', sets: 2, repsRange: '8-12', startWeight: '12.5 kg', notes: 'Keep a controlled tempo.' },
  { id: 'row', name: 'Chest supported row', sets: 1, repsRange: '10-12', startWeight: '20 kg', notes: '' },
]
const plans = [
  { id: 'upper', name: 'Upper body', dayOfWeek: 'Monday', time: '1:30 PM', exercises },
  { id: 'lower', name: 'Lower body', dayOfWeek: 'Tuesday', time: '1:30 PM', exercises },
]

async function setup(page: Parameters<typeof mockStores>[0], extra: Record<string, unknown> = {}) {
  await page.clock.install({ time: new Date('2026-10-06T18:00:00Z') })
  const backend = await mockStores(page, { 'cortex-gym-plans': plans, ...extra })
  await page.goto('/#/gym')
  return backend
}

for (const width of [320, 390]) {
  test(`workout tracking fits a ${width}px phone and survives reload`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const backend = await setup(page)
    const start = page.getByRole('button', { name: /^Start workout$/i })
    await expect(start).toHaveCount(1)
    await expect(start).toBeInViewport()
    expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole('heading', { name: 'Lower body', exact: true })).toBeVisible()
    if (width === 390) await page.screenshot({ path: '/tmp/cortex-gym-ready-390.png' })
    await start.click()
    await expect(page.getByRole('button', { name: 'Log set', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Weight (kg)', exact: true })).toHaveValue('12.5')
    await page.getByRole('textbox', { name: 'Weight (kg)', exact: true }).fill('17.5')
    await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('9')
    if (width === 390) await page.screenshot({ path: '/tmp/cortex-gym-active-390.png' })
    await page.getByRole('button', { name: 'Log set', exact: true }).click()
    await expect.poll(() => (backend.stores['cortex-gym-active'] as { exerciseLogs: { sets: { completed: boolean }[] }[] })?.exerciseLogs[0].sets[0].completed).toBe(true)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Skip rest', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Skip rest', exact: true }).click()
    for (const label of ['Weight (kg)', 'Reps']) {
      const field = page.getByRole('textbox', { name: label, exact: true })
      const box = await field.boundingBox()
      expect(box).toBeTruthy()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    }
    const logBox = await page.getByRole('button', { name: 'Log set', exact: true }).boundingBox()
    expect(logBox!.width).toBeGreaterThan(220)
    expect(logBox!.height).toBeGreaterThanOrEqual(44)
    await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
    await page.getByRole('button', { name: 'Save workout', exact: true }).click()
    await expect.poll(() => backend.stores['cortex-gym-active']).toBeNull()
    await expect.poll(() => backend.stores[`cortex-gym-session-${today}`]).toMatchObject([
      { workoutDayId: 'lower', completedFully: false, exercises: [{ sets: [{ weight: 17.5, reps: 9, completed: true }, { completed: false }] }, {}] },
    ])
    await expect(page.getByText('Saved today', { exact: false }).first()).toBeVisible()
  })
}

test('rest expiry preserves edits made during the countdown', async ({ page }) => {
  const backend = await setup(page)
  await page.getByRole('button', { name: 'Start workout', exact: true }).click()
  await page.getByRole('button', { name: 'Log set', exact: true }).click()
  await page.getByRole('textbox', { name: 'Weight (kg)', exact: true }).fill('25')
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('11')
  await expect.poll(() => (backend.stores['cortex-gym-active'] as { exerciseLogs: { sets: { weight: number }[] }[] })?.exerciseLogs[0].sets[1].weight).toBe(25)
  await page.clock.fastForward('02:00')
  await expect(page.getByRole('button', { name: 'Skip rest', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Weight (kg)', exact: true })).toHaveValue('25')
  await expect(page.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('11')
})

test('previous values are matched by exercise id after a plan reorder', async ({ page }) => {
  await setup(page, {
    'cortex-gym-session-2026-10-05': [{
      date: '2026-10-05', workoutDayId: 'lower', workoutName: 'Lower body',
      startedAt: '2026-10-05T18:00:00Z', completedFully: true,
      exercises: [
        { exerciseId: 'row', exerciseName: 'Chest supported row', sets: [{ weight: 40, reps: 10, completed: true }] },
        { exerciseId: 'press', exerciseName: 'Incline dumbbell press', sets: [{ weight: 22.5, reps: 9, completed: true }, { weight: 20, reps: 8, completed: true }] },
      ],
    }],
  })
  await page.getByRole('button', { name: 'Start workout', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Weight (kg)', exact: true })).toHaveValue('22.5')
  await expect(page.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('9')
})

test('finishing the last set saves a complete workout', async ({ page }) => {
  const backend = await setup(page, { 'cortex-gym-plans': [{ ...plans[1], exercises: [{ ...exercises[0], sets: 1 }] }] })
  await page.getByRole('button', { name: 'Start workout', exact: true }).click()
  await page.getByRole('button', { name: 'Log set', exact: true }).click()
  await expect.poll(() => backend.stores[`cortex-gym-session-${today}`]).toMatchObject([{ completedFully: true }])
  await expect.poll(() => backend.stores['cortex-gym-active']).toBeNull()
})

test('nutrition has large water controls and saves the logged glass', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  const backend = await setup(page)
  await page.getByRole('tab', { name: 'Nutrition', exact: true }).click()
  const add = page.getByRole('button', { name: 'Add a glass of water', exact: true })
  await expect(add).toBeVisible()
  expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await add.click()
  await expect.poll(() => backend.stores[`cortex-nutrition-${today}`]).toMatchObject({ waterLiters: 0.25 })
  await expect(page.getByRole('button', { name: 'Pantry', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'Meal plan', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await page.reload()
  await page.getByRole('tab', { name: 'Nutrition', exact: true }).click()
  await expect(page.getByLabel('Daily nutrition')).toContainText('0.25')
})

test('a saved workout survives a missing plan and can be discarded', async ({ page }) => {
  const backend = await setup(page, {
    'cortex-gym-plans': [],
    'cortex-gym-active': {
      workoutDayId: 'missing', startedAt: '2026-10-06T18:00:00Z', currentExerciseIndex: 0, currentSetIndex: 0,
      exerciseLogs: [{ exerciseId: 'press', exerciseName: 'Saved press', sets: [{ weight: 15, reps: 8, completed: false }] }],
      restTimerEnd: null, restDuration: 90, isResting: false,
    },
  })
  await expect(page.getByRole('textbox', { name: 'Weight (kg)', exact: true })).toHaveValue('15')
  await page.getByRole('button', { name: 'Discard workout', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Discard workout', exact: true }).click()
  await expect.poll(() => backend.stores['cortex-gym-active']).toBeNull()
  expect(backend.stores[`cortex-gym-session-${today}`]).toBeUndefined()
})
