import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

function trayHarness(habits: Array<{ id: string; name: string; emoji: string; onHold?: boolean }>) {
  const records = {
    'cortex-habits': habits,
    'cortex-habits-history': { '2026-09-19': { active: true } } as Record<string, Record<string, boolean>>,
  }
  const writes: Array<{ key: string; data: unknown }> = []
  let menuUpdates = 0
  const declarations = [functionSource('refreshTrayHabits'), functionSource('toggleHabitFromTray')].join('\n')
  const javascript = ts.transpileModule(declarations, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  const context = vm.createContext({
    records,
    console,
    localDate: () => '2026-09-19',
    readDataKeyParsed: async (key: keyof typeof records) => structuredClone(records[key]),
    writeDataKey: async (key: keyof typeof records, data: typeof records[typeof key]) => {
      writes.push({ key, data: structuredClone(data) })
      Object.assign(records, { [key]: structuredClone(data) })
      return { ok: true, rev: '2' }
    },
    buildTrayMenu: () => ({}),
    tray: { setContextMenu: () => { menuUpdates += 1 } },
  })
  vm.runInContext(
    `let cachedHabits = []; let cachedHabitHistory = {}; ${javascript}\n` +
    'globalThis.harness = { refreshTrayHabits, toggleHabitFromTray, getHabits: () => cachedHabits };',
    context,
  )
  const harness = context.harness as {
    refreshTrayHabits: () => Promise<void>
    toggleHabitFromTray: (id: string) => Promise<void>
    getHabits: () => Array<{ id: string; onHold?: boolean }>
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

  records['cortex-habits'][1].onHold = true
  await harness.refreshTrayHabits()
  assert.deepEqual(Array.from(harness.getHabits(), (habit) => habit.id), ['active'])
  assert.equal(menuUpdates(), 2)

  const writeBody = functionSource('writeDataKey')
  assert.match(writeBody, /key === 'cortex-habits'[\s\S]*?await refreshTrayHabits\(\)/)
})

test('a stale tray click cannot change archived or deleted habit history', async () => {
  const { records, writes, harness } = trayHarness([
    { id: 'active', name: 'Read', emoji: 'R' },
    { id: 'held', name: 'Swim', emoji: 'S', onHold: true },
  ])

  await harness.toggleHabitFromTray('held')
  await harness.toggleHabitFromTray('deleted')
  assert.deepEqual(writes, [])
  assert.deepEqual(records['cortex-habits-history'], { '2026-09-19': { active: true } })

  await harness.toggleHabitFromTray('active')
  assert.equal(writes.length, 1)
  assert.deepEqual(records['cortex-habits-history'], { '2026-09-19': { active: false } })
})
