import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')
const tree = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true)

function functionSource(name: string): string {
  const declaration = tree.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.ok(declaration, `electron/main.ts must define ${name}`)
  return declaration.getText(tree)
}

function trayHarness(
  habits: Array<{ id: string; name: string; emoji: string; onHold?: boolean }>,
  options: {
    history?: Record<string, Record<string, boolean>>
    noHabitsKey?: boolean
    beforeCommit?: (key: string) => Promise<void>
  } = {},
) {
  const records = {
    'cortex-habits': options.noHabitsKey ? null : habits,
    'cortex-habits-history': options.history ?? { '2026-09-19': { active: true } },
  }
  const writes: Array<{ key: string; data: unknown }> = []
  let menuUpdates = 0
  const declarations = [
    functionSource('withKeyLock'),
    functionSource('refreshTrayHabits'),
    functionSource('toggleHabitFromTray'),
    functionSource('writeDataKey'),
  ].join('\n')
  const javascript = ts.transpileModule(declarations, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  const context = vm.createContext({
    records,
    console,
    localDate: () => '2026-09-19',
    readDataKeyParsed: async (key: keyof typeof records) => structuredClone(records[key]),
    readDataFile: async (key: keyof typeof records) => ({
      text: records[key] === null ? null : JSON.stringify(records[key]),
    }),
    encryptAndWriteAsync: async (file: string, serialized: string) => {
      const key = path.basename(file, '.json') as keyof typeof records
      await options.beforeCommit?.(key)
      const data = JSON.parse(serialized)
      writes.push({ key, data: structuredClone(data) })
      Object.assign(records, { [key]: structuredClone(data) })
    },
    KEY_RE: /^[A-Za-z0-9._-]{1,200}$/,
    fs: { promises: { copyFile: async () => {}, mkdir: async () => {}, readdir: async () => [] } },
    backupDir: '/isolated-test-backup',
    VERSIONED_BACKUPS_KEPT: 10,
    path,
    dataDir: '/isolated-test-data',
    statRev: async (file: string) => {
      const key = path.basename(file, '.json') as keyof typeof records
      return records[key] === null ? null : 'unchanged-rev'
    },
    broadcastDataChanged: () => {},
    buildTrayMenu: () => ({}),
    tray: { setContextMenu: () => { menuUpdates += 1 } },
  })
  vm.runInContext(
    `let cachedHabits = []; let cachedHabitHistory = {}; let trayHabitRefreshVersion = 0; let currentStats = { tasks: '0/0', habits: '7/9', score: '—' }; const keyWriteLocks = new Map(); ${javascript}\n` +
    'globalThis.harness = { refreshTrayHabits, toggleHabitFromTray, writeDataKey, getHabits: () => cachedHabits, getStats: () => currentStats };',
    context,
  )
  const harness = context.harness as {
    refreshTrayHabits: () => Promise<void>
    toggleHabitFromTray: (id: string) => Promise<void>
    writeDataKey: (key: string, data: unknown, opts: { source: string }) => Promise<{ ok: boolean; data?: unknown }>
    getHabits: () => Array<{ id: string; onHold?: boolean }>
    getStats: () => { habits: string }
  }
  return { records, writes, harness, menuUpdates: () => menuUpdates }
}

test('tray refresh drops newly archived habits without waiting for its five-minute poll', async () => {
  const { records, harness, menuUpdates } = trayHarness([
    { id: 'active', name: 'Read', emoji: 'R' },
    { id: 'held', name: 'Swim', emoji: 'S' },
  ])
  await harness.refreshTrayHabits()
  assert.deepEqual(Array.from(harness.getHabits(), (habit) => habit.id), ['active', 'held'])

  const archived = records['cortex-habits'].map((habit) =>
    habit.id === 'held' ? { ...habit, onHold: true } : habit,
  )
  await harness.writeDataKey('cortex-habits', archived, { source: 'ipc' })
  assert.deepEqual(Array.from(harness.getHabits(), (habit) => habit.id), ['active'])
  assert.equal(menuUpdates(), 2)
})

test('a stale tray click cannot change archived or deleted habit history', async () => {
  const { records, writes, harness } = trayHarness([
    { id: 'active', name: 'Read', emoji: 'R' },
    { id: 'held', name: 'Swim', emoji: 'S' },
  ])
  await harness.refreshTrayHabits()
  records['cortex-habits'][1].onHold = true // menu remains stale until the click

  await harness.toggleHabitFromTray('held')
  await harness.toggleHabitFromTray('deleted')
  assert.deepEqual(writes, [])
  assert.deepEqual(records['cortex-habits-history'], { '2026-09-19': { active: true } })

  await harness.toggleHabitFromTray('active')
  assert.equal(writes.length, 1)
  assert.deepEqual(records['cortex-habits-history'], { '2026-09-19': { active: false } })
})

test('history writes cannot add held completions or erase earlier held history', async () => {
  const { records, harness } = trayHarness(
    [{ id: 'active', name: 'Read', emoji: 'R' }, { id: 'held', name: 'Swim', emoji: 'S', onHold: true }],
    { history: { '2026-09-18': { held: true }, '2026-09-19': { active: false } } },
  )
  const result = await harness.writeDataKey('cortex-habits-history', {
    '2026-09-19': { active: true, held: true },
  }, { source: 'http' })
  assert.deepEqual(records['cortex-habits-history'], {
    '2026-09-18': { held: true },
    '2026-09-19': { active: true },
  })
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), records['cortex-habits-history'])
})

test('archive and history writes share a lock so an in-flight archive wins', async () => {
  let startArchiveCommit!: () => void
  let finishArchiveCommit!: () => void
  const archiveAtCommit = new Promise<void>((resolve) => { startArchiveCommit = resolve })
  const allowArchiveCommit = new Promise<void>((resolve) => { finishArchiveCommit = resolve })
  const { records, harness } = trayHarness(
    [{ id: 'active', name: 'Read', emoji: 'R' }, { id: 'held', name: 'Swim', emoji: 'S' }],
    { beforeCommit: async (key) => {
      if (key !== 'cortex-habits') return
      startArchiveCommit()
      await allowArchiveCommit
    } },
  )
  const archive = harness.writeDataKey('cortex-habits', [
    { id: 'active', name: 'Read', emoji: 'R' },
    { id: 'held', name: 'Swim', emoji: 'S', onHold: true },
  ], { source: 'ipc' })
  await archiveAtCommit
  const staleHistory = harness.writeDataKey('cortex-habits-history', {
    '2026-09-19': { active: true, held: true },
  }, { source: 'http' })
  finishArchiveCommit()
  await Promise.all([archive, staleHistory])
  assert.deepEqual(records['cortex-habits-history'], { '2026-09-19': { active: true } })
})

test('the first history write still works before the habits key is created', async () => {
  const { records, harness } = trayHarness([], { noHabitsKey: true, history: {} })
  await harness.writeDataKey('cortex-habits-history', { '2026-09-19': { 'default-habit': true } }, { source: 'ipc' })
  assert.deepEqual(records['cortex-habits-history'], { '2026-09-19': { 'default-habit': true } })
})

test('tray summary updates from active habits while Home is unmounted', async () => {
  const { harness } = trayHarness([
    { id: 'active', name: 'Read', emoji: 'R' },
    { id: 'held', name: 'Swim', emoji: 'S', onHold: true },
  ], { history: { '2026-09-19': { active: true, held: true } } })
  await harness.refreshTrayHabits()
  assert.equal(harness.getStats().habits, '1/1')
})
