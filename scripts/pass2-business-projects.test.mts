import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProjectInfo } from '../src/types/electron.ts'
import { filterProjects, getGitHubUrl, type ProjectMeta } from '../src/features/projects/project-model.ts'

const project = (name: string, type: ProjectInfo['type'] = 'app') => ({ name, type, description: '' }) as ProjectInfo
const meta = (fields: Partial<ProjectMeta>) => fields as ProjectMeta

test('projects sort by written priority and search their written context', () => {
  const projects = [project('unranked'), project('second'), project('first', 'library')]
  const notes = { first: meta({ priority: 1, status: 'archived', why: 'Billing ledger' }), second: meta({ priority: 2, status: 'active' }) }
  const all = { type: null, status: null, search: '' }
  assert.deepEqual(filterProjects(projects, notes, all).map((p) => p.name), ['first', 'second', 'unranked'])
  assert.deepEqual(filterProjects(projects, notes, { ...all, search: 'ledger' }).map((p) => p.name), ['first'])
  assert.deepEqual(filterProjects(projects, notes, { ...all, status: 'archived' }).map((p) => p.name), ['first'])
  assert.deepEqual(filterProjects(projects, notes, { ...all, type: 'app' }).map((p) => p.name), ['second', 'unranked'])
})

test('GitHub remotes resolve to their web page in SSH and HTTPS form only', () => {
  assert.equal(getGitHubUrl('git@github.com:example/demo.git'), 'https://github.com/example/demo')
  assert.equal(getGitHubUrl('https://github.com/example/demo.git'), 'https://github.com/example/demo')
  assert.equal(getGitHubUrl('https://gitlab.com/example/demo.git'), null)
})
