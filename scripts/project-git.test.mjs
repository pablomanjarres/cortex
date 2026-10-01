import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readLatestCommit } from '../electron/project-git.ts'

test('project scanner reads commits in paths containing shell punctuation', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'cortex-project-git-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const project = join(root, 'my "quoted" $project')
  mkdirSync(project)
  execFileSync('git', ['init', '-q', project])
  execFileSync('git', ['-C', project, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'Record project progress'], {
    env: { ...process.env, GIT_AUTHOR_DATE: '2026-09-14T10:00:00Z', GIT_COMMITTER_DATE: '2026-09-14T10:00:00Z' },
  })
  assert.deepEqual(readLatestCommit(project), { message: 'Record project progress', date: '2026-09-14' })
  assert.equal(readLatestCommit(root), null)
})
