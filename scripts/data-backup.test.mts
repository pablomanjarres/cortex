import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { backupPreviousVersion, type BackupFs } from '../electron/data-backup.ts'

function tempDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-backup-'))
  const file = path.join(root, 'cortex-active-sprint.json')
  fs.writeFileSync(file, '"previous"')
  return { root, file, backupDir: path.join(root, 'backups') }
}

const never = () => new Promise<never>(() => {})

test('a backup copy that never finishes does not block the caller', async () => {
  const { file, backupDir } = tempDirs()
  const stalled: BackupFs = { ...fs.promises, copyFile: never }
  const started = Date.now()
  const result = await backupPreviousVersion({
    key: 'cortex-active-sprint', file, backupDir, keep: 10, timeoutMs: 50, fs: stalled,
  })
  assert.equal(result, 'timeout')
  assert.ok(Date.now() - started < 1000, 'backup step must give up within its timeout')
})

test('while a stalled backup is still running, later backups of that key are skipped at once', async () => {
  const { file, backupDir } = tempDirs()
  const stalled: BackupFs = { ...fs.promises, copyFile: never }
  const opts = { key: 'cortex-stalled-key', file, backupDir, keep: 10, timeoutMs: 50, fs: stalled }
  assert.equal(await backupPreviousVersion(opts), 'timeout')
  const started = Date.now()
  assert.equal(await backupPreviousVersion(opts), 'skipped')
  assert.ok(Date.now() - started < 50)
})

test('a failing copy is reported, never thrown', async () => {
  const { file, backupDir } = tempDirs()
  const failing: BackupFs = { ...fs.promises, copyFile: async () => { throw new Error('EIO') } }
  const result = await backupPreviousVersion({
    key: 'cortex-failing-key', file, backupDir, keep: 10, timeoutMs: 1000, fs: failing,
  })
  assert.equal(result, 'error')
})

test('writes the .bak copy and keeps only the newest versioned backups', async () => {
  const { file, backupDir } = tempDirs()
  const key = 'cortex-retention-key'
  const versionsDir = path.join(backupDir, 'versions', key)
  fs.mkdirSync(versionsDir, { recursive: true })
  for (let i = 0; i < 12; i++) {
    fs.writeFileSync(path.join(versionsDir, `2020-01-01T00-00-${String(i).padStart(2, '0')}-000Z.json`), 'old')
  }
  const result = await backupPreviousVersion({ key, file, backupDir, keep: 10, timeoutMs: 1000 })
  assert.equal(result, 'ok')
  assert.equal(fs.readFileSync(path.join(backupDir, `${key}.bak.json`), 'utf8'), '"previous"')
  const versions = fs.readdirSync(versionsDir).sort()
  assert.equal(versions.length, 10)
  assert.ok(!versions.includes('2020-01-01T00-00-00-000Z.json'), 'oldest versions are pruned')
  assert.equal(fs.readFileSync(path.join(versionsDir, versions.at(-1)!), 'utf8'), '"previous"')
})
