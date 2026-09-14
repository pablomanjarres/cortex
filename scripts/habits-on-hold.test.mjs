import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { Client } from '../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'
import { StdioClientTransport } from '../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js'

// Exercise the actual MCP tools against an isolated data API. No personal data.
test('on-hold habits survive creation, edits, activation, and rereads', async (t) => {
  const records = new Map([
    ['cortex-habits', [{ id: 'existing', name: 'Read', emoji: 'R', weeklyGoal: 3 }]],
    ['cortex-habits-history', { '2026-09-13': { existing: true } }],
  ])
  let rev = 0
  const api = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    const url = new URL(req.url, 'http://localhost')
    if (req.method === 'GET') {
      res.setHeader('x-cortex-rev', String(rev))
      res.end(JSON.stringify(records.get(url.searchParams.get('key')) ?? null))
      return
    }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const { key, data } = JSON.parse(Buffer.concat(chunks).toString())
    records.set(key, data)
    res.end(JSON.stringify({ ok: true, rev: String(++rev) }))
  })
  api.listen(0, '127.0.0.1')
  await once(api, 'listening')
  t.after(() => new Promise(resolve => api.close(resolve)))
  const client = new Client({ name: 'habits-test', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [process.env.CORTEX_MCP_ENTRY || fileURLToPath(new URL('../mcp-server/dist/index.js', import.meta.url))],
    env: { ...process.env, CORTEX_API: `http://127.0.0.1:${api.address().port}` },
    stderr: 'pipe',
  })
  t.after(() => client.close())
  await client.connect(transport)
  const call = async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args })
    assert.notEqual(response.isError, true, JSON.stringify(response))
    return JSON.parse(response.content.find(c => c.type === 'text').text)
  }

  const { habit } = await call('add_habit', {
    name: 'Swimming lessons', emoji: 'S', category: 'Health', cadence: 'monthly',
    goal: 0, context: 'Start when the pool opens', onHold: true,
  })
  assert.equal(habit.onHold, true)
  assert.equal(habit.monthlyGoal, 0)
  assert.equal(records.get('cortex-habits').find(h => h.id === habit.id).onHold, true)

  await call('update_habit', { habitId: habit.id, name: 'Swimming' })
  const held = (await call('get_habits')).find(h => h.id === habit.id)
  assert.equal(held.onHold, true, 'unrelated edits must preserve the hold')
  assert.equal(held.context, 'Start when the pool opens')

  await call('update_habit', { habitId: habit.id, onHold: false })
  const activated = (await call('get_habits')).find(h => h.id === habit.id)
  assert.deepEqual(activated, { ...held, onHold: false })

  await call('update_habit', { habitId: 'existing', onHold: true })
  assert.deepEqual(records.get('cortex-habits-history'), { '2026-09-13': { existing: true } })
  await call('update_habit', { habitId: 'existing', onHold: false })
  assert.equal(records.get('cortex-habits').find(h => h.id === 'existing').weeklyGoal, 3)

  const { habit: active } = await call('add_habit', { name: 'Walk' })
  assert.notEqual(active.onHold, true, 'habits added without a hold remain active')
})
