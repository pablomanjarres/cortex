import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

async function startHttpMcp(t, apiUrl) {
  const reservation = createServer()
  const port = await listen(reservation)
  await new Promise((resolve) => reservation.close(resolve))
  const entry = process.env.CORTEX_MCP_ENTRY || fileURLToPath(new URL('../mcp-server/dist/index.js', import.meta.url))
  const child = spawn(process.execPath, [entry, '--http'], {
    env: { ...process.env, PORT: String(port), CORTEX_API: apiUrl },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'exit')
      child.kill('SIGTERM')
      await closed
    }
  })
  await new Promise((resolve, reject) => {
    let diagnostics = ''
    const timer = setTimeout(() => reject(new Error(`MCP startup timed out: ${diagnostics}`)), 10_000)
    child.once('error', reject)
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`MCP exited ${code}: ${diagnostics}`)) })
    child.stderr.on('data', (chunk) => {
      diagnostics = (diagnostics + chunk).slice(-8192)
      if (diagnostics.includes(`listening on 0.0.0.0:${port}`)) { clearTimeout(timer); resolve() }
    })
  })
  return `http://127.0.0.1:${port}/mcp`
}

async function post(url, message) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-03-26',
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000),
  })
  const raw = await response.text()
  const data = response.headers.get('content-type')?.includes('text/event-stream')
    ? raw.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5)
    : raw
  return { status: response.status, body: data ? JSON.parse(data) : null, raw }
}

test('HTTP MCP supports initialization, notification and read tools across independent clients', { timeout: 30_000 }, async (t) => {
  const seen = []
  const api = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url })
    res.setHeader('Content-Type', 'application/json')
    if (req.method !== 'GET') { res.writeHead(405); res.end('{}'); return }
    const id = new URL(req.url, 'http://fixture').searchParams.get('id')
    res.end(JSON.stringify({ note: { id }, lines: ['Fixture narrative'] }))
  })
  const apiPort = await listen(api)
  t.after(() => new Promise((resolve) => api.close(resolve)))
  const url = await startHttpMcp(t, `http://127.0.0.1:${apiPort}`)

  for (let client = 0; client < 2; client++) {
    const initialized = await post(url, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: `http-fixture-${client}`, version: '1.0.0' } },
    })
    assert.equal(initialized.status, 200, initialized.raw)
    assert.equal(initialized.body.result.serverInfo.name, 'cortex')
    const notification = await post(url, { jsonrpc: '2.0', method: 'notifications/initialized' })
    assert.equal(notification.status, 202, notification.raw)
    const listed = await post(url, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    assert.equal(listed.status, 200, listed.raw)
    assert.ok(listed.body.result.tools.some((tool) => tool.name === 'obsidian_read'))
    const read = await post(url, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'obsidian_read', arguments: { id: 'fixture-note' } } })
    assert.equal(read.status, 200, read.raw)
    assert.equal(read.body.result.isError, undefined)
    assert.deepEqual(JSON.parse(read.body.result.content[0].text), { note: { id: 'fixture-note' }, lines: ['Fixture narrative'] })
  }
  const parallel = await Promise.all(['parallel-a', 'parallel-b'].map((id) => post(url, {
    jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'obsidian_read', arguments: { id } },
  })))
  assert.deepEqual(parallel.map((result) => result.status), [200, 200])
  assert.deepEqual(parallel.map((result) => JSON.parse(result.body.result.content[0].text).note.id), ['parallel-a', 'parallel-b'])
  assert.ok(seen.every((request) => request.method === 'GET'))
  assert.deepEqual(seen.map((request) => request.url).sort(), [
    '/api/knowledge/read?id=fixture-note', '/api/knowledge/read?id=fixture-note',
    '/api/knowledge/read?id=parallel-a', '/api/knowledge/read?id=parallel-b',
  ])

  for (const [origin, expected] of [['http://localhost:3000', 'http://localhost:3000'], ['https://untrusted.invalid', null]]) {
    const response = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin }, signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), expected)
  }
})
