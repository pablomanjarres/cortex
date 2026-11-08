import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-mars-'))
process.env.MARS_VAULT_ROOT = root
const { readJournalDay, readVoiceAnchors, searchVault, writeJournalLine } = await import('../electron/integrations/mars.ts')
const { vaultErrorStatus } = await import('../electron/knowledge/vault-files.ts')

/** Stand-in for a note iCloud has evicted: its size is known but no bytes are on disk. */
function evict(file: string) {
  fs.writeFileSync(file, '')
  fs.truncateSync(file, 4096)
  assert.equal(fs.statSync(file).blocks, 0, 'the test filesystem keeps sparse files sparse')
}

test('Mars helpers skip notes still in iCloud and never wait for one', (t) => {
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const content = path.join(root, 'content')
  fs.mkdirSync(path.join(content, 'voice-anchors'), { recursive: true })
  fs.mkdirSync(path.join(content, 'journal'), { recursive: true })
  fs.writeFileSync(path.join(content, 'Near.md'), 'red planet\n')
  evict(path.join(content, 'Far.md'))
  fs.writeFileSync(path.join(content, 'voice-anchors', 'Calm.md'), 'calm voice\n')
  evict(path.join(content, 'voice-anchors', 'Evicted.md'))
  evict(path.join(content, 'journal', '2026-11-08.md'))

  const reads = t.mock.method(fs, 'readFileSync')
  syncBuiltinESMExports()
  t.after(() => { reads.mock.restore(); syncBuiltinESMExports() })

  assert.deepEqual(searchVault('red').map(match => match.rel), [path.join('content', 'Near.md')])
  assert.deepEqual(readVoiceAnchors().map(anchor => anchor.name), ['Calm'])
  const answers503 = (error: unknown) => /still in iCloud/.test(String(error)) && vaultErrorStatus(error) === 503
  assert.throws(() => readJournalDay('2026-11-08'), answers503)
  assert.throws(() => writeJournalLine('note', { date: '2026-11-08' }), answers503)
  assert.equal(vaultErrorStatus(new Error('boom')), 500)
  const opened = reads.mock.calls.map(call => String(call.arguments[0]))
  assert.deepEqual(opened.filter(file => /Far\.md|Evicted\.md|2026-11-08\.md/.test(file)), [])
})
