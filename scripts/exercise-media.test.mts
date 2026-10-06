import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { findExerciseMedia } from '../src/lib/exercise-media.ts'

const originalFetch = globalThis.fetch
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const saved = new Map([
  ['floor-demo', 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'],
  ['alternate-demo', 'R0lGODlhAgABAIAAAAAAAP///yH5BAEAAAAALAAAAAACAAEAAAICBAoAOw=='],
])
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  electronAPI: { media: { load: async (id: string) => {
    if (id === 'unreadable') throw new Error('Media read failed')
    return saved.get(id) ?? null
  } } },
} })
globalThis.fetch = async () => new Response(JSON.stringify([{
  name: 'Leg Press', images: ['Leg_Press/0.jpg', 'Leg_Press/1.jpg'],
  primaryMuscles: ['quadriceps'], equipment: 'machine', level: 'beginner',
}]), { status: 200, headers: { 'Content-Type': 'application/json' } })

after(() => {
  globalThis.fetch = originalFetch
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
})

test('saved GIF overrides stock frames and preserves its GIF MIME type', async () => {
  const result = await findExerciseMedia('Leg Press', 'floor-demo')
  assert.deepEqual(result?.images, [
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  ])
})

test('different saved media IDs for the same exercise resolve different GIFs', async () => {
  const result = await findExerciseMedia('Leg Press', 'alternate-demo')
  assert.deepEqual(result?.images, [
    'data:image/gif;base64,R0lGODlhAgABAIAAAAAAAP///yH5BAEAAAAALAAAAAACAAEAAAICBAoAOw==',
  ])
})

test('a custom floor exercise displays saved media without a database match', async () => {
  const result = await findExerciseMedia('Floor Lying Straight-Leg Raise', 'floor-demo')
  assert.equal(result?.images.length, 1)
  assert.match(result?.images[0] ?? '', /^data:image\/gif;base64,/)
})

test('missing or unreadable custom media falls back to stock demonstration frames', async () => {
  for (const id of ['missing', 'unreadable', undefined]) {
    const result = await findExerciseMedia('Leg Press', id)
    assert.deepEqual(result?.images, [
      'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Leg_Press/0.jpg',
      'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Leg_Press/1.jpg',
    ])
    assert.deepEqual(result?.primaryMuscles, ['quadriceps'])
  }
})

test('an unmatched exercise with missing saved media remains a placeholder', async () => {
  assert.equal(await findExerciseMedia('Floor Lying Straight-Leg Raise', 'missing'), null)
})
