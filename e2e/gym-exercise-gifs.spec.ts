import { test, expect, mockStores } from './fixtures'
import type { Page } from '@playwright/test'

const floorName = 'Floor Lying Straight-Leg Raise'
const firstGif = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const secondGif = 'R0lGODlhAgABAIAAAAAAAP///yH5BAEAAAAALAAAAAACAAEAAAICBAoAOw=='
const gifUrl = (raw: string) => `data:image/gif;base64,${raw}`
const exercise = (id: string, name: string, gifMediaId: string) => ({
  id, name, gifMediaId, sets: 2, repsRange: '8–12', startWeight: 'Bodyweight', notes: '',
})
const plan = (exercises: ReturnType<typeof exercise>[]) => ({
  id: 'demo-day', name: 'Demo workout', dayOfWeek: 'Tuesday', time: '1:30–3 PM', exercises,
})

async function mediaRoutes(page: Page, media: Record<string, string>) {
  await page.route('**/api/media?*', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id') ?? ''
    return route.fulfill({ json: media[id] ?? null })
  })
  await page.route('**/dist/exercises.json', (route) => route.fulfill({ json: [{
    name: 'Leg Press', images: ['Leg_Press/0.jpg', 'Leg_Press/1.jpg'],
    primaryMuscles: ['quadriceps'], equipment: 'machine', level: 'beginner',
  }] }))
  await page.route('**/exercises/Leg_Press/*.jpg', (route) => route.fulfill({
    contentType: 'image/gif', body: Buffer.from(firstGif, 'base64'),
  }))
}

test('saved GIFs display in plan thumbnails, preview and active training', async ({ page }) => {
  const day = plan([exercise('first', floorName, 'first'), exercise('second', floorName, 'second')])
  const backend = await mockStores(page, { 'cortex-gym-plans': [day] })
  await mediaRoutes(page, { first: firstGif, second: secondGif })
  await page.goto('/#/gym')
  const previews = page.getByRole('button', { name: `Preview ${floorName}`, exact: true })
  await expect(previews.nth(0).getByRole('img')).toHaveAttribute('src', gifUrl(firstGif))
  await expect(previews.nth(1).getByRole('img')).toHaveAttribute('src', gifUrl(secondGif))
  await previews.nth(0).click()
  await expect(page.getByRole('dialog').getByRole('img')).toHaveAttribute('src', gifUrl(firstGif))
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Start Workout', exact: true }).click()
  await expect(page.getByRole('img', { name: floorName, exact: true })).toHaveAttribute('src', gifUrl(firstGif))
  await page.getByRole('button', { name: 'Next exercise', exact: true }).click()
  await expect(page.getByRole('img', { name: floorName, exact: true })).toHaveAttribute('src', gifUrl(secondGif))
  expect((backend.stores['cortex-gym-plans'] as typeof day[])[0].exercises[0].gifMediaId).toBe('first')
})

test('a GIF decoding failure falls back to stock and a new exercise retries saved media', async ({ page }) => {
  await mockStores(page, { 'cortex-gym-plans': [plan([
    exercise('bad', 'Leg Press', 'corrupt'), exercise('good', floorName, 'good'),
  ])] })
  await mediaRoutes(page, { corrupt: 'AAAA', good: firstGif })
  await page.goto('/#/gym')
  const stock = page.getByRole('button', { name: 'Preview Leg Press', exact: true }).getByRole('img')
  await expect(stock).toHaveAttribute('src', /\/exercises\/Leg_Press\/[01]\.jpg$/)
  await page.getByRole('button', { name: 'Start Workout', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Leg Press', exact: true })).toHaveAttribute('src', /\/Leg_Press\/[01]\.jpg$/)
  await page.getByRole('button', { name: 'Next exercise', exact: true }).click()
  await expect(page.getByRole('img', { name: floorName, exact: true })).toHaveAttribute('src', gifUrl(firstGif))
})

test('a late media response cannot replace the next exercise GIF with the same name', async ({ page }) => {
  const day = plan([exercise('first', floorName, 'slow'), exercise('second', floorName, 'fast')])
  await mockStores(page, {
    'cortex-gym-plans': [day],
    'cortex-gym-active': {
      workoutDayId: day.id, startedAt: '2026-10-06T18:30:00Z', currentExerciseIndex: 0,
      currentSetIndex: 0, restTimerEnd: null, restDuration: 90, isResting: false,
      exerciseLogs: day.exercises.map((ex) => ({ exerciseId: ex.id, exerciseName: ex.name,
        sets: [{ weight: 0, reps: 0, completed: false }, { weight: 0, reps: 0, completed: false }] })),
    },
  })
  let release!: () => void
  let requested = false
  let completed!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  const responseDone = new Promise<void>((resolve) => { completed = resolve })
  await page.route('**/api/media?*', async (route) => {
    const slow = new URL(route.request().url()).searchParams.get('id') === 'slow'
    if (slow) { requested = true; await pending }
    await route.fulfill({ json: slow ? firstGif : secondGif })
    if (slow) completed()
  })
  await page.goto('/#/gym')
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Next exercise', exact: true }).click()
  await expect(page.getByRole('img', { name: floorName, exact: true })).toHaveAttribute('src', gifUrl(secondGif))
  release()
  await responseDone
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.getByRole('img', { name: floorName, exact: true })).toHaveAttribute('src', gifUrl(secondGif))
})
