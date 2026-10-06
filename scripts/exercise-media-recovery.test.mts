import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import type { ExerciseMedia } from '../src/lib/exercise-media.ts'

const source = readFileSync(process.env.EXERCISE_MEDIA_TEST_SOURCE || new URL('../src/lib/exercise-media.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const entries = [
  { name: 'Dumbbell Lateral Raise', images: ['Dumbbell_Lateral_Raise/0.jpg', 'Dumbbell_Lateral_Raise/1.jpg'], primaryMuscles: ['shoulders'], equipment: 'dumbbell' },
  { name: 'Romanian Deadlift', images: ['Romanian_Deadlift/0.jpg'], primaryMuscles: ['hamstrings'], equipment: 'barbell' },
  { name: 'Hip Flexion', images: ['Hip_Flexion/0.jpg'], primaryMuscles: ['quadriceps'] },
]

function harness(fetch: typeof globalThis.fetch) {
  const exports: { findExerciseMedia?: (name: string) => Promise<ExerciseMedia | null> } = {}
  vm.runInNewContext(javascript, { exports, fetch, AbortController, setTimeout, clearTimeout })
  assert.ok(exports.findExerciseMedia)
  return exports.findExerciseMedia
}

function response(data: unknown = entries, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

test('a transient HTTP failure does not permanently cache unavailable exercise media', async () => {
  let requests = 0
  const find = harness(async () => ++requests === 1 ? response(null, 503) : response())
  assert.equal(await find('DB Lateral Raise'), null)
  const recovered = await find('DB Lateral Raise')
  assert.equal(requests, 2)
  assert.equal(recovered?.name, 'Dumbbell Lateral Raise')
  assert.match(recovered!.images[0], /\/exercises\/Dumbbell_Lateral_Raise\/0\.jpg$/)
})

test('a rejected fetch and an empty index can each recover on the next lookup', async () => {
  for (const failure of ['network', 'empty']) {
    let requests = 0
    const find = harness(async () => {
      if (++requests === 1) {
        if (failure === 'network') throw new Error('Temporary network failure')
        return response([])
      }
      return response()
    })
    assert.equal(await find('RDL'), null)
    assert.equal((await find('RDL'))?.name, 'Romanian Deadlift')
    assert.equal(requests, 2)
  }
})

test('concurrent lookups share the index request and successful results are memoized', async () => {
  let requests = 0
  let release!: (value: Response) => void
  const find = harness(() => {
    requests++
    return new Promise<Response>((resolve) => { release = resolve })
  })
  const lateral = find('DB Lateral Raise')
  const deadlift = find('RDL')
  assert.equal(requests, 1)
  release(response())
  const [first, second] = await Promise.all([lateral, deadlift])
  assert.equal(first?.name, 'Dumbbell Lateral Raise')
  assert.equal(second?.name, 'Romanian Deadlift')
  assert.strictEqual(await find(' db lateral raise '), first)
  assert.equal(await find('Unknown Movement'), null)
  assert.equal(await find('unknown movement'), null)
  assert.equal(requests, 1)
})

test('compound names resolve a supported abbreviation without an unrelated generic match', async () => {
  const find = harness(async () => response())
  assert.equal((await find('Unknown Movement / RDL'))?.name, 'Romanian Deadlift')
  assert.equal((await find('Unknown Movement or DB Lateral Raise'))?.name, 'Dumbbell Lateral Raise')
  assert.equal(await find('Neck Flexion'), null)
})
