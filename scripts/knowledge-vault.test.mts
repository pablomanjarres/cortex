import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { KnowledgeVaultService, VaultError, resolveMarsRoot, revisionOf } from '../electron/knowledge/vault.ts'
import { bodyOf, composeNote, parseNote } from '../electron/knowledge/frontmatter.ts'

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-vault-'))
  const eightfold = path.join(dir, 'Eightfold')
  const life = path.join(dir, 'Life Project')
  const mars = path.join(dir, 'Mars')
  fs.mkdirSync(path.join(eightfold, '.obsidian'), { recursive: true })
  fs.mkdirSync(path.join(eightfold, 'Ventures'), { recursive: true })
  fs.mkdirSync(path.join(eightfold, 'System', 'Cortex'), { recursive: true })
  fs.mkdirSync(path.join(mars, 'content'), { recursive: true })
  fs.mkdirSync(life, { recursive: true })
  fs.writeFileSync(path.join(eightfold, '.obsidian', 'Secret.md'), 'hidden')
  fs.writeFileSync(path.join(eightfold, 'Home.md'), '---\nid: home-eightfold\ntype: home\n---\n\n# Home\nCanvas prep question\n')
  fs.writeFileSync(path.join(eightfold, 'Ventures', 'Cortex.md'), '---\nid: venture-cortex\ntype: project\ncortex_refs:\n  - project:cortex\n  - "crm:crm-1"\n---\n\nCortex notes\n')
  fs.writeFileSync(path.join(eightfold, 'Ventures', 'Board.base'), 'filters:\n  and:\n    - type == "project"\n')
  fs.writeFileSync(path.join(eightfold, 'Ventures', 'Attachment.pdf'), 'pdf bytes')
  fs.writeFileSync(path.join(eightfold, 'System', 'Cortex', 'Overview.md'), '---\ngenerated: true\n---\n\nOverview\n')
  fs.writeFileSync(path.join(eightfold, 'Map.canvas'), JSON.stringify({
    nodes: [
      { id: 'g1', type: 'group', x: 0, y: 0, width: 400, height: 240, label: 'Prep', color: '4' },
      { id: 't1', type: 'text', x: 20, y: 20, width: 200, height: 80, text: 'Canvas strategy card' },
      { id: 'f1', type: 'file', x: 250, y: 20, width: 120, height: 80, file: 'Home.md', subpath: '#Home' },
    ],
    edges: [{ id: 'e1', fromNode: 't1', fromSide: 'right', fromEnd: 'none', toNode: 'f1', toSide: 'left', toEnd: 'arrow', label: 'uses' }],
  }))
  fs.writeFileSync(path.join(mars, 'content', 'Mars.md'), 'red planet\n')
  const outside = path.join(dir, 'outside.md')
  fs.writeFileSync(outside, 'outside')
  fs.symlinkSync(outside, path.join(eightfold, 'Escape.md'))
  fs.symlinkSync(path.join(eightfold, '.obsidian', 'Secret.md'), path.join(eightfold, 'Alias.md'))
  fs.symlinkSync(dir, path.join(eightfold, 'Loop'))
  const registry = path.join(dir, 'obsidian.json')
  fs.writeFileSync(registry, JSON.stringify({ vaults: { 'life-id': { path: life, ts: 10, open: true }, 'mars-id': { path: mars, ts: 20 } } }))
  const service = new KnowledgeVaultService({ configuredRoot: eightfold, registryPaths: [registry], legacyMarsRoot: null, now: () => new Date('2026-10-18T12:00:00.000Z') })
  return { dir, eightfold, life, mars, registry, service }
}

test('frontmatter round-trips the property shapes Obsidian writes', () => {
  const note = composeNote({ id: 'n-1', type: 'note', status: 'proposed', created: '2026-10-18T12:00:00.000Z', cortex_refs: ['project:cortex', 'crm:1'], count: 3, flag: true, odd: 'yes', numeric: '42', empty: null }, 'Line one\n\n## Heading\n')
  const parsed = parseNote(note)
  assert.equal(parsed.complex, false)
  assert.deepEqual(parsed.properties, { id: 'n-1', type: 'note', status: 'proposed', created: '2026-10-18T12:00:00.000Z', cortex_refs: ['project:cortex', 'crm:1'], count: 3, flag: true, odd: 'yes', numeric: '42', empty: null })
  assert.equal(bodyOf(parsed), 'Line one\n\n## Heading\n')
  assert.equal(parseNote('---\nnested:\n  deep: 1\n---\nbody').complex, true)
  assert.deepEqual(parseNote('no frontmatter').properties, {})
})

test('frontmatter preserves string types that YAML could infer and empty lists', () => {
  const values = { exponent: '1e3', hex: '0x10', infinity: '.inf', nullLike: 'NULL', emptyList: [] }
  assert.deepEqual(parseNote(composeNote(values, 'body')).properties, values)
})

test('vault discovery puts the configured Eightfold vault first, then the registry, then the registered Mars vault', () => {
  const fx = fixture()
  const vaults = fx.service.vaults()
  assert.deepEqual(vaults.map(vault => [vault.name, vault.source, vault.primary, vault.writable]), [
    ['Eightfold', 'configured', true, true],
    ['Life Project', 'registry', false, false],
    ['Mars', 'registry', false, false],
  ])
  assert.equal(vaults[2].id, 'mars-id')
  assert.equal(resolveMarsRoot({ envRoot: '', registryPaths: [fx.registry] }), fx.mars)
  assert.equal(resolveMarsRoot({ envRoot: '/explicit/Mars', registryPaths: [fx.registry] }), '/explicit/Mars')
  const none = new KnowledgeVaultService({ configuredRoot: path.join(fx.dir, 'missing'), registryPaths: [], legacyMarsRoot: fx.mars })
  assert.equal(none.primary(), null)
  assert.deepEqual(none.vaults().map(vault => vault.source), ['legacy-mars'])
})

test('listing is paginated, hides config and symlinks, and labels Bases, Canvas and attachments', () => {
  const fx = fixture()
  const first = fx.service.listFiles({ limit: 3 })
  const second = fx.service.listFiles({ limit: 10, cursor: first.nextCursor! })
  const all = [...first.files, ...second.files]
  assert.deepEqual(all.map(file => file.path), ['Home.md', 'Map.canvas', 'System/Cortex/Overview.md', 'Ventures/Attachment.pdf', 'Ventures/Board.base', 'Ventures/Cortex.md'])
  assert.deepEqual(all.map(file => file.kind), ['markdown', 'canvas', 'markdown', 'attachment', 'base', 'markdown'])
  assert.equal(first.files[0].uri, 'obsidian://open?vault=Eightfold&file=Home')
  assert.equal(second.nextCursor, null)
  const capped = new KnowledgeVaultService({ configuredRoot: fx.eightfold, registryPaths: [], legacyMarsRoot: null, maxFiles: 2 }).listFiles()
  assert.equal(capped.truncated, true)
  assert.equal(capped.total, 2)
})

test('reads Markdown with identity and revision, Bases as text, and Canvas with geometry and edges', () => {
  const fx = fixture()
  const home = fx.service.read({ path: 'Home.md', limit: 2 })
  assert.equal(home.kind, 'markdown')
  assert.deepEqual(home.note, { vault: 'Eightfold', vaultId: home.vaultId, id: 'home-eightfold', path: 'Home.md', title: 'Home', uri: 'obsidian://open?vault=Eightfold&file=Home' })
  assert.equal(home.revision, revisionOf(fs.readFileSync(path.join(fx.eightfold, 'Home.md'), 'utf8')))
  assert.deepEqual(home.lines, ['---', 'id: home-eightfold'])
  assert.equal(home.nextCursor, '2')
  assert.equal(fx.service.read({ id: 'venture-cortex' }).path, 'Ventures/Cortex.md')
  assert.equal(fx.service.read({ path: 'Ventures/Board.base' }).kind, 'base')
  const canvas = fx.service.read({ path: 'Map.canvas', limit: 2 }) as unknown as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[]; nextCursor: string; totalNodes: number }
  assert.deepEqual(canvas.nodes[0], { id: 'g1', type: 'group', x: 0, y: 0, width: 400, height: 240, label: 'Prep', color: '4' })
  assert.equal('text' in canvas.nodes[1], false)
  assert.deepEqual(canvas.edges[0], { id: 'e1', fromNode: 't1', fromSide: 'right', fromEnd: 'none', toNode: 'f1', toSide: 'left', toEnd: 'arrow', label: 'uses' })
  assert.equal(canvas.totalNodes, 3)
  const withText = fx.service.read({ path: 'Map.canvas', includeText: true, cursor: '1', limit: 1 }) as unknown as { nodes: Record<string, unknown>[] }
  assert.equal(withText.nodes[0].text, 'Canvas strategy card')
  assert.equal(fx.service.read({ vault: 'Mars', path: 'content/Mars.md' }).lines[0], 'red planet')
})

test('reads reject traversal, hidden paths, symlink escapes and unsupported files', () => {
  const fx = fixture()
  const rejects = (fn: () => unknown, status: number, pattern: RegExp) => assert.throws(fn, (error: unknown) => error instanceof VaultError && error.status === status && pattern.test(error.message))
  rejects(() => fx.service.read({ path: '../outside.md' }), 400, /inside the vault/)
  rejects(() => fx.service.read({ path: '/etc/hosts' }), 400, /inside the vault/)
  rejects(() => fx.service.read({ path: '.obsidian/Secret.md' }), 403, /hidden or config/)
  rejects(() => fx.service.read({ path: 'Alias.md' }), 403, /hidden or config/)
  rejects(() => fx.service.read({ path: 'Escape.md' }), 403, /symlink escapes/)
  rejects(() => fx.service.read({ path: 'Loop/outside.md' }), 403, /symlink escapes/)
  rejects(() => fx.service.read({ path: 'Ventures/Attachment.pdf' }), 400, /Only Markdown/)
  rejects(() => fx.service.read({ id: 'missing' }), 404, /No note/)
  rejects(() => fx.service.listFiles({ folder: 'Loop' }), 403, /symlink escapes/)
})

test('search covers filenames, Markdown, Bases and Canvas cards with bounded pages', () => {
  const fx = fixture()
  const result = fx.service.search({ query: 'canvas', limit: 10 })
  assert.deepEqual(result.matches.map(match => [match.path, match.kind]), [['Home.md', 'text'], ['Map.canvas', 'filename'], ['Map.canvas', 'canvas-node']])
  for (let index = 0; index < 30; index++) fs.writeFileSync(path.join(fx.eightfold, `z-${String(index).padStart(2, '0')}.md`), 'needle\n')
  const page = fx.service.search({ query: 'needle', limit: 5 })
  assert.equal(page.matches.length, 5)
  assert.equal(page.nextCursor, '5')
  assert.equal(fx.service.search({ query: 'needle', limit: 50, cursor: '25' }).matches.length, 5)
  assert.throws(() => fx.service.search({ query: '  ' }), VaultError)
})

test('notes resolve by Cortex record reference and the Home note is found by type', () => {
  const fx = fixture()
  assert.deepEqual(fx.service.notesForRef('project:cortex').map(note => note.id), ['venture-cortex'])
  assert.deepEqual(fx.service.notesForRef('crm:crm-1').map(note => note.path), ['Ventures/Cortex.md'])
  assert.deepEqual(fx.service.notesForRef('crm:unknown'), [])
  assert.equal(fx.service.homeNote()?.id, 'home-eightfold')
  // Rename-safe: the id and reference still resolve after the file moves.
  fs.renameSync(path.join(fx.eightfold, 'Ventures', 'Cortex.md'), path.join(fx.eightfold, 'Ventures', 'Cortex app.md'))
  assert.equal(fx.service.read({ id: 'venture-cortex' }).path, 'Ventures/Cortex app.md')
  assert.equal(fx.service.notesForRef('project:cortex')[0].uri, 'obsidian://open?vault=Eightfold&file=Ventures%2FCortex%20app')
})

test('capture creates a new Markdown note atomically with a stable id and never overwrites', () => {
  const fx = fixture()
  const first = fx.service.capture({ title: 'Call: notes / ideas', body: 'First body', properties: { cortex_refs: ['crm:crm-1'], area: 'sales', created: 'ignored' } })
  assert.equal(first.path, 'Inbox/Call notes ideas.md')
  assert.match(first.id!, /^note-[0-9a-f-]{36}$/)
  const parsed = parseNote(fs.readFileSync(path.join(fx.eightfold, first.path), 'utf8'))
  assert.deepEqual(parsed.properties, { id: first.id, type: 'note', cortex_refs: ['crm:crm-1'], area: 'sales', created: '2026-10-18T12:00:00.000Z', updated: '2026-10-18T12:00:00.000Z' })
  assert.equal(bodyOf(parsed), 'First body')
  const second = fx.service.capture({ title: 'Call: notes / ideas', body: 'Second body' })
  assert.equal(second.path, 'Inbox/Call notes ideas 2.md')
  assert.equal(bodyOf(parseNote(fs.readFileSync(path.join(fx.eightfold, first.path), 'utf8'))), 'First body')
  assert.deepEqual(fs.readdirSync(path.join(fx.eightfold, 'Inbox')).filter(name => name.endsWith('.tmp')), [])
  assert.throws(() => fx.service.capture({ title: 'x', folder: 'System' }), /protected/)
  assert.throws(() => fx.service.capture({ title: 'x', folder: '.obsidian' }), /hidden or config/)
  assert.throws(() => fx.service.capture({ title: 'x', folder: 'Loop' }), /symlink escapes/)
  assert.throws(() => fx.service.capture({ title: 'x', vault: 'Mars' }), /read-only/)
  assert.throws(() => fx.service.capture({ title: 'x', properties: { id: 'home-eightfold' } }), /already exists/)
})

test('updates require the current revision, keep id immutable and refuse generated files', () => {
  const fx = fixture()
  const read = fx.service.read({ id: 'venture-cortex' })
  const updated = fx.service.updateNote({ id: 'venture-cortex', baseRevision: read.revision, body: 'New narrative', properties: { status: 'active', cortex_refs: ['project:cortex'] } })
  const parsed = parseNote(fs.readFileSync(path.join(fx.eightfold, 'Ventures', 'Cortex.md'), 'utf8'))
  assert.deepEqual(parsed.properties, { id: 'venture-cortex', type: 'project', cortex_refs: ['project:cortex'], status: 'active', updated: '2026-10-18T12:00:00.000Z' })
  assert.equal(bodyOf(parsed), 'New narrative')
  assert.notEqual(updated.revision, read.revision)
  assert.throws(() => fx.service.updateNote({ id: 'venture-cortex', baseRevision: read.revision, body: 'stale' }), (error: unknown) => error instanceof VaultError && error.status === 409 && error.details?.revision === updated.revision)
  assert.throws(() => fx.service.updateNote({ id: 'venture-cortex', baseRevision: updated.revision, properties: { id: 'other' } }), /cannot change/)
  const overview = fx.service.read({ path: 'System/Cortex/Overview.md' })
  assert.throws(() => fx.service.updateNote({ path: 'System/Cortex/Overview.md', baseRevision: overview.revision, body: 'x' }), /protected/)
  fs.writeFileSync(path.join(fx.eightfold, 'Generated.md'), '---\ngenerated: true\n---\n\nx\n')
  assert.throws(() => fx.service.updateNote({ path: 'Generated.md', baseRevision: fx.service.read({ path: 'Generated.md' }).revision, body: 'y' }), /protected/)
  fs.writeFileSync(path.join(fx.eightfold, 'Nested.md'), '---\nmeta:\n  deep: 1\n---\n\nold\n')
  const nested = fx.service.read({ path: 'Nested.md' })
  assert.throws(() => fx.service.updateNote({ path: 'Nested.md', baseRevision: nested.revision, properties: { status: 'x' } }), /cannot be edited safely/)
  fx.service.updateNote({ path: 'Nested.md', baseRevision: nested.revision, body: 'new' })
  assert.equal(fs.readFileSync(path.join(fx.eightfold, 'Nested.md'), 'utf8'), '---\nmeta:\n  deep: 1\n---\n\nnew\n')
})

test('body-only updates preserve YAML properties and comments exactly', (t) => {
  const fx = fixture()
  t.after(() => fs.rmSync(fx.dir, { recursive: true, force: true }))
  const frontmatter = '---\nid: yaml-note\ntags: [one, two] # keep tags\nowner: {team: growth}\nstatus: active # keep this comment\n---\n'
  const file = path.join(fx.eightfold, 'Yaml.md')
  fs.writeFileSync(file, `${frontmatter}\nold\n`)
  const note = fx.service.read({ path: 'Yaml.md' })

  fx.service.updateNote({ path: 'Yaml.md', baseRevision: note.revision, body: 'new' })

  assert.equal(fs.readFileSync(file, 'utf8'), `${frontmatter}\nnew\n`)
})

test('property updates refuse nested YAML rather than flattening its values', (t) => {
  const fx = fixture()
  t.after(() => fs.rmSync(fx.dir, { recursive: true, force: true }))
  const raw = '---\nid: nested-yaml-note\nowner: {team: growth}\n---\n\nold\n'
  const file = path.join(fx.eightfold, 'Nested yaml.md')
  fs.writeFileSync(file, raw)
  const note = fx.service.read({ path: 'Nested yaml.md' })

  assert.throws(() => fx.service.updateNote({ path: 'Nested yaml.md', baseRevision: note.revision, properties: { status: 'active' } }),
    (error: unknown) => error instanceof VaultError && error.status === 409)
  assert.equal(fs.readFileSync(file, 'utf8'), raw)
})

test('generated flags with YAML inline comments still prevent writes', (t) => {
  const fx = fixture()
  t.after(() => fs.rmSync(fx.dir, { recursive: true, force: true }))
  for (const [index, flag] of ['generated: true # runtime-owned', 'cortex_generated: TRUE # runtime-owned', '"generated": true # runtime-owned'].entries()) {
    const rel = `Generated ${index}.md`, raw = `---\nid: generated-${index}\n${flag}\n---\n\noriginal\n`
    const file = path.join(fx.eightfold, rel)
    fs.writeFileSync(file, raw)
    const note = fx.service.read({ path: rel })

    assert.throws(() => fx.service.updateNote({ path: rel, baseRevision: note.revision, body: 'replacement' }),
      (error: unknown) => error instanceof VaultError && error.status === 403, flag)
    assert.equal(fs.readFileSync(file, 'utf8'), raw)
  }
})
