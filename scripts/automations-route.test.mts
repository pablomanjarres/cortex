import assert from 'node:assert/strict'
import test from 'node:test'
import { routeForPath } from '../src/lib/routes.ts'

test('automations have a dedicated navigable page outside System', () => {
  const route = routeForPath('/automations')
  assert.equal(route?.title, 'Automations')
  assert.equal(route?.group, 'Core')
})
