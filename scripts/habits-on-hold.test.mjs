import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

test('MCP keeps held habits inactive until reactivated', async (t) => {
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
  t.after(() => new Promise((resolve) => api.close(resolve)))

  const entry = process.env.CORTEX_MCP_ENTRY || fileURLToPath(new URL('../mcp-server/dist/index.js', import.meta.url))
  const client = new Client({ name: 'habits-on-hold-test', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: { ...process.env, CORTEX_API: `http://127.0.0.1:${api.address().port}` },
    stderr: 'pipe',
  })
  t.after(() => client.close())
  await client.connect(transport)

  const call = async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args })
    assert.notEqual(response.isError, true, JSON.stringify(response))
    return JSON.parse(response.content.find((part) => part.type === 'text').text)
  }

  const { habit } = await call('add_habit', {
    name: 'Swimming lessons',
    emoji: 'S',
    category: 'Health',
    cadence: 'monthly',
    goal: 0,
    context: 'Start when the pool opens',
    onHold: true,
  })
  assert.equal(habit.onHold, true)
  assert.equal(habit.monthlyGoal, 0)

  await call('update_habit', { habitId: habit.id, name: 'Swimming' })
  const held = (await call('get_habits')).find((item) => item.id === habit.id)
  assert.equal(held.onHold, true)
  assert.equal(held.context, 'Start when the pool opens')

  await call('update_habit', { habitId: 'existing', onHold: true })
  const heldToggle = await client.callTool({
    name: 'toggle_habit',
    arguments: { habitId: 'existing', date: '2026-09-14' },
  })
  assert.equal(heldToggle.isError, true)
  assert.deepEqual(records.get('cortex-habits-history'), { '2026-09-13': { existing: true } })

  await call('update_habit', { habitId: 'existing', onHold: false })
  const activeToggle = await call('toggle_habit', { habitId: 'existing', date: '2026-09-14' })
  assert.deepEqual(activeToggle, { ok: true, date: '2026-09-14', habitId: 'existing', done: true })
  assert.equal(records.get('cortex-habits').find((item) => item.id === 'existing').weeklyGoal, 3)
})
