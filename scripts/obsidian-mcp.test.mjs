import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

test('obsidian MCP tools proxy the shared Cortex vault service', async (t) => {
  const seen = []
  const api = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
    seen.push({ method: req.method, url: req.url, body })
    res.setHeader('Content-Type', 'application/json')
    if (req.url.startsWith('/api/knowledge/update') && body?.baseRevision === 'stale') {
      res.statusCode = 409
      res.end(JSON.stringify({ error: 'The note changed since it was read.', revision: 'b'.repeat(64) }))
      return
    }
    res.end(JSON.stringify({ ok: true }))
  })
  api.listen(0, '127.0.0.1')
  await once(api, 'listening')
  t.after(() => new Promise((resolve) => api.close(resolve)))

  const entry = process.env.CORTEX_MCP_ENTRY || fileURLToPath(new URL('../mcp-server/dist/index.js', import.meta.url))
  const client = new Client({ name: 'obsidian-mcp-test', version: '1.0.0' })
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { ...process.env, CORTEX_API: `http://127.0.0.1:${api.address().port}` }, stderr: 'pipe' })
  t.after(() => client.close())
  await client.connect(transport)

  const names = (await client.listTools()).tools.map((tool) => tool.name).filter((name) => name.startsWith('obsidian_')).sort()
  assert.deepEqual(names, ['obsidian_capture', 'obsidian_list_files', 'obsidian_list_vaults', 'obsidian_read', 'obsidian_search', 'obsidian_update_note'])

  const call = (name, args = {}) => client.callTool({ name, arguments: args })
  await call('obsidian_list_vaults')
  await call('obsidian_list_files', { vault_id: 'Mars', extensions: ['md', 'canvas'], limit: 5, cursor: '5' })
  await call('obsidian_search', { query: 'auth & login', limit: 3 })
  await call('obsidian_read', { id: 'venture-cortex', include_text: true })
  await call('obsidian_capture', { title: 'Call', body: 'Notes', properties: { cortex_refs: ['crm:crm-1'] } })
  const conflict = await call('obsidian_update_note', { id: 'venture-cortex', base_revision: 'stale', body: 'x' })
  assert.equal(conflict.isError, true)
  assert.match(conflict.content[0].text, /409/)

  assert.deepEqual(seen.map(({ method, url }) => `${method} ${url}`), [
    'GET /api/knowledge/vaults',
    'GET /api/knowledge/files?vault=Mars&extensions=md%2Ccanvas&limit=5&cursor=5',
    'GET /api/knowledge/search?q=auth+%26+login&limit=3',
    'GET /api/knowledge/read?id=venture-cortex&includeText=true',
    'POST /api/knowledge/capture',
    'POST /api/knowledge/update',
  ])
  assert.deepEqual(seen[4].body, { title: 'Call', body: 'Notes', properties: { cortex_refs: ['crm:crm-1'] } })
  assert.deepEqual(seen[5].body, { id: 'venture-cortex', baseRevision: 'stale', body: 'x' })
})
