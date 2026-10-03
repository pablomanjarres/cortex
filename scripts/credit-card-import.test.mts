import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { CREDIT_CARD_KEY, CREDIT_CARD_ALERTS_KEY } from '../electron/credit-card-types.ts'

function importHarness(reject = false) {
  const source = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true)
  const statement = tree.statements.find(node => ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) && node.expression.arguments[0]?.getText(tree) === "'data:importAll'")
  assert.ok(statement && ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression))
  const callback = statement.expression.arguments[1].getText(tree)
  const events: string[] = []
  const context = vm.createContext({
    console: { error() {}, warn() {} }, CREDIT_CARD_KEY, CREDIT_CARD_ALERTS_KEY,
    KEY_RE: /^[A-Za-z0-9._-]{1,200}$/, backupDir: '/test-backups', dataDir: '/test-data',
    path: { join: (...parts: string[]) => parts.join('/') },
    fs: { promises: { mkdir: async () => { events.push('backup') }, readdir: async () => [], copyFile: async () => {} } },
    creditCardRuntime: {
      validateImport: () => { events.push('validate'); if (reject) throw Error('Invalid card backup') },
      restore: async (bundle: Record<string, unknown>) => {
        events.push('managed')
        return [CREDIT_CARD_KEY, CREDIT_CARD_ALERTS_KEY].filter(key => Object.hasOwn(bundle, key)).length
      },
    },
    writeDataKey: async (key: string) => { events.push(key); return { ok: true } },
  })
  vm.runInContext(ts.transpileModule(`globalThis.runImport = ${callback}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, context)
  return { events, run: (bundle: unknown) => context.runImport(null, JSON.stringify(bundle)) as Promise<{ success: boolean; count?: number; error?: string }> }
}

test('full import restores both managed keys once and counts them with ordinary keys', async () => {
  const { events, run } = importHarness()
  const result = await run({ _meta: {}, [CREDIT_CARD_KEY]: {}, [CREDIT_CARD_ALERTS_KEY]: {}, 'cortex-finance': {} })
  assert.equal(result.success, true)
  assert.equal(result.count, 3)
  assert.deepEqual(events, ['validate', 'backup', 'managed', 'cortex-finance'])
})

test('full import rejects invalid managed state before backup or ordinary writes', async () => {
  const { events, run } = importHarness(true)
  const result = await run({ [CREDIT_CARD_KEY]: {}, 'cortex-finance': {} })
  assert.equal(result.success, false)
  assert.match(result.error ?? '', /Invalid card backup/)
  assert.deepEqual(events, ['validate'])
})
