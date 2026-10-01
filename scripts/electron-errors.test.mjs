import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorMessage } from '../electron/errors.ts'

test('API errors preserve exception messages', () => {
  assert.equal(errorMessage(new Error('Calendar access denied')), 'Calendar access denied')
  assert.equal(errorMessage({ message: 'Service unavailable' }), 'Service unavailable')
})

test('non-Error rejections still produce a readable JSON error', () => {
  for (const [error, expected] of [
    ['Connection timed out', 'Connection timed out'],
    [null, 'Request failed'],
    [undefined, 'Request failed'],
    [{ message: 42 }, 'Request failed'],
  ]) {
    assert.deepEqual(JSON.parse(JSON.stringify({ error: errorMessage(error) })), { error: expected })
  }
  assert.equal(errorMessage(null, 'history failed'), 'history failed')
})
