import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { BlackoutAdapter, BlackoutHost } from './screen-blackout-service.js'

function run(file: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 64 * 1024 }, (error, stdout) => {
      if (error) {
        // Native helpers may return a short structured error. Do not expose
        // execFile's command line or encoded PowerShell in the UI.
        try {
          const result = JSON.parse(stdout)
          const native = typeof result.stdout === 'string' ? JSON.parse(result.stdout) : result
          if (typeof native.error === 'string') { reject(new Error(native.error)); return }
        } catch { /* transport failure */ }
        reject(new Error(file === '/usr/bin/ssh' ? 'laptop-w is unreachable or ScreenBlackout is unavailable' : 'Screen command could not finish; refresh to read its current state'))
      } else resolve(stdout)
    })
  })
}

function enabledFromJson(text: string): boolean {
  const result = JSON.parse(text)
  if (typeof result.enabled !== 'boolean' || !Number.isInteger(result.monitorCount) || result.monitorCount < 1) {
    throw new Error('Screen helper returned an invalid state')
  }
  return result.enabled
}

export function createNativeBlackoutAdapter(resources: { helper: string; windowsScript: string }): BlackoutAdapter {
  async function execute(host: BlackoutHost, action: 'status' | 'on' | 'off'): Promise<boolean> {
    if (host === 'mac') return enabledFromJson(await run(resources.helper, [action], 8_000))
    const script = `$Action = '${action}'\n${await readFile(resources.windowsScript, 'utf8')}`
    if (action === 'status') {
      const encoded = Buffer.from(script, 'utf16le').toString('base64')
      return enabledFromJson(await run('/usr/bin/ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=3', '-o', 'ServerAliveInterval=2', '-o', 'ServerAliveCountMax=1', 'laptop-w', 'powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], 8_000))
    }
    // Desktop session placement, readiness, concurrency and receipts stay owned
    // by machine-route. Never replay an uncertain toggle after a lost receipt.
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cortex-blackout-'))
    try {
      const file = path.join(directory, 'command.ps1')
      await writeFile(file, script, { mode: 0o600 })
      const receipt = JSON.parse(await run(path.join(os.homedir(), '.local/bin/machine-route'), ['run', '--kind', 'browser', '--script-file', file, '--timeout', '8'], 45_000))
      if (receipt.status !== 'completed' || typeof receipt.stdout !== 'string') {
        throw new Error('laptop-w did not confirm the screen change; refresh before retrying')
      }
      return enabledFromJson(receipt.stdout.trim())
    } finally { await rm(directory, { recursive: true, force: true }) }
  }
  return { read: host => execute(host, 'status'), set: (host, enabled) => execute(host, enabled ? 'on' : 'off') }
}
