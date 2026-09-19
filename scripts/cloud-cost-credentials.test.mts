import test from 'node:test'
import assert from 'node:assert/strict'
import * as gcpCosts from '../electron/integrations/gcp-costs.ts'

const serviceAccount = {
  type: 'service_account',
  project_id: 'nella-sync',
  client_email: 'cortex-billing-reader@nella-sync.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
  token_uri: 'https://untrusted.example/token',
}

const credentials = gcpCosts as typeof gcpCosts & {
  parseGcpServiceAccount: (raw: string) => Record<string, string>
  resolveGcpAuthOptions: (raw: string | null, localAdcPath: string | null) => Record<string, unknown>
}

test('a dedicated billing key overrides local and ambient Google credentials', () => {
  assert.equal(typeof credentials.resolveGcpAuthOptions, 'function')
  assert.deepEqual(
    credentials.resolveGcpAuthOptions(JSON.stringify(serviceAccount), '/home/pablo/.config/gcloud/application_default_credentials.json'),
    {
      credentials: {
        type: 'service_account',
        project_id: 'nella-sync',
        client_email: 'cortex-billing-reader@nella-sync.iam.gserviceaccount.com',
        private_key: serviceAccount.private_key,
      },
    },
  )
})

test('local user ADC wins over unrelated process-wide Google credentials', () => {
  assert.deepEqual(
    credentials.resolveGcpAuthOptions(null, '/home/pablo/.config/gcloud/application_default_credentials.json'),
    { keyFilename: '/home/pablo/.config/gcloud/application_default_credentials.json' },
  )
})

test('missing dedicated and local credentials never fall through to ambient Google credentials', () => {
  assert.throws(() => credentials.resolveGcpAuthOptions(null, null), /credentials unavailable/i)
})

test('service-account import rejects user credentials and strips untrusted endpoints', () => {
  assert.equal(typeof credentials.parseGcpServiceAccount, 'function')
  assert.throws(() => credentials.parseGcpServiceAccount(JSON.stringify({ type: 'authorized_user', refresh_token: 'secret' })), /service account/i)
  assert.deepEqual(credentials.parseGcpServiceAccount(JSON.stringify(serviceAccount)), {
    type: 'service_account',
    project_id: 'nella-sync',
    client_email: 'cortex-billing-reader@nella-sync.iam.gserviceaccount.com',
    private_key: serviceAccount.private_key,
  })
})

test('the sanitized key can be loaded again after encrypted storage serialization', () => {
  const stored = JSON.stringify(credentials.parseGcpServiceAccount(JSON.stringify(serviceAccount)))
  assert.deepEqual(credentials.resolveGcpAuthOptions(stored, null), {
    credentials: credentials.parseGcpServiceAccount(stored),
  })
})

test('a malformed dedicated key fails closed instead of falling back to another identity', () => {
  assert.throws(
    () => credentials.resolveGcpAuthOptions('{"type":"service_account"}', '/home/pablo/.config/gcloud/application_default_credentials.json'),
    /service account/i,
  )
})
