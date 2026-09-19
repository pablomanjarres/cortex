import test from 'node:test'
import assert from 'node:assert/strict'
import { isPublicKeychainService } from '../electron/keychain-access.ts'

test('reserved GCP credentials cannot be reached through coerced keychain service values', () => {
  assert.equal(isPublicKeychainService('github-token'), true)
  assert.equal(isPublicKeychainService('cloud-cost-gcp-service-account'), false)
  assert.equal(isPublicKeychainService(['cloud-cost-gcp-service-account']), false)
  assert.equal(isPublicKeychainService({ toString: () => 'cloud-cost-gcp-service-account' }), false)
  assert.equal(isPublicKeychainService(null), false)
})
