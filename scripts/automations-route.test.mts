import assert from 'node:assert/strict'
import test from 'node:test'
import { routeForPath } from '../src/lib/routes.ts'

test('automations retain a dedicated page in the redesigned System navigation', () => {
  const route = routeForPath('/automations')
  assert.equal(route?.path, '/automations')
  assert.equal(route?.title, 'Automations')
  assert.equal(route?.group, 'System')
})
