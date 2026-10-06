import assert from 'node:assert/strict'
import test from 'node:test'
import { activeSetIndex, setIndexAfterRemoval, summarizeWorkoutSets } from '../src/features/gym/domain/workout-progress.ts'

const pending = { weight: 20, reps: 8, completed: false }
const completed = { ...pending, completed: true }

test('removing an earlier set keeps the same active set selected', () => {
  assert.equal(setIndexAfterRemoval(2, 0, [completed, pending]), 1)
})

test('removing the active set selects an unfinished set instead of a completed neighbour', () => {
  assert.equal(setIndexAfterRemoval(1, 1, [pending, completed]), 0)
})

test('restored invalid pointers still select a loggable set', () => {
  assert.equal(activeSetIndex([pending, completed], 9), 0)
  assert.equal(activeSetIndex([pending, completed], -1), 0)
  assert.equal(activeSetIndex([], 4), 0)
})

test('completed exercises retain an in-range history position', () => {
  assert.equal(activeSetIndex([completed, completed], 9), 1)
})

test('workout summary counts completed and unfinished sets across exercises', () => {
  assert.deepEqual(summarizeWorkoutSets([
    { exerciseId: 'press', exerciseName: 'Press', sets: [completed, pending] },
    { exerciseId: 'row', exerciseName: 'Row', sets: [completed] },
  ]), { totalSets: 3, completedSets: 2 })
  assert.deepEqual(summarizeWorkoutSets([]), { totalSets: 0, completedSets: 0 })
})
