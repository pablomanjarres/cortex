import test from 'node:test'
import assert from 'node:assert/strict'
import * as routes from '../src/lib/routes.ts'

const oldPaths = [
  '/daily',
  '/habits',
  '/goals',
  '/system',
  '/founder',
  '/cloud-costs',
  '/student',
  '/projects',
  '/opportunities',
  '/finance',
  '/gym',
  '/social',
  '/books',
  '/library',
  '/settings',
]

test('old navigation paths keep resolving exactly and when nested', () => {
  for (const path of oldPaths) {
    assert.equal(routes.routeForPath(path)?.path, path)
    assert.equal(routes.routeForPath(`${path}/detail`)?.path, path)
    assert.notEqual(routes.titleForPath(path), 'Dashboard')
  }
})

test('navigation groups use the light shell destinations with Calendar under Today', () => {
  assert.deepEqual(routes.NAV_GROUPS.map((group) => group.label), ['Today', 'Build', 'Study', 'Life', 'System'])
  assert.deepEqual(routes.NAV_GROUPS.find((group) => group.label === 'Today')?.routes.map((route) => route.path), [
    '/daily',
    '/calendar',
    '/habits',
    '/goals',
  ])
})

test('navigation search returns route and action destinations without user records', () => {
  assert.equal(typeof routes.searchNavigation, 'function')
  const searchNavigation = routes.searchNavigation as (query: string) => Array<{ href: string }>
  assert.deepEqual(searchNavigation('cloud').map((item) => item.href), ['/cloud-costs'])
  assert.deepEqual(searchNavigation('capture').map((item) => item.href), ['/library?kind=captures'])
  assert.deepEqual(searchNavigation('missing-person-name'), [])
})
