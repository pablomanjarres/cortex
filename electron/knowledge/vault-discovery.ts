// Where vaults are: the configured primary root, Obsidian's own vault
// registry, and the legacy Mars vault. Also the obsidian:// URI format.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_VAULT_ROOT = path.join(os.homedir(), 'Knowledge', 'Eightfold')
export const DEFAULT_REGISTRY_PATHS = [
  path.join(os.homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json'),
  path.join(os.homedir(), '.config', 'obsidian', 'obsidian.json'),
  ...(process.env.APPDATA ? [path.join(process.env.APPDATA, 'obsidian', 'obsidian.json')] : []),
]

export const isDir = (target: string) => { try { return fs.statSync(target).isDirectory() } catch { return false } }

export function obsidianUri(vaultName: string, rel: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(rel.replace(/\.md$/i, ''))}`
}
export function obsidianSearchUri(vaultName: string, query: string): string {
  return `obsidian://search?vault=${encodeURIComponent(vaultName)}&query=${encodeURIComponent(query)}`
}

/** Legacy Mars vault: explicit override, then the registered `Mars` vault with content/, then known folders. */
export function resolveMarsRoot(opts: { envRoot?: string | null; registryPaths?: string[] } = {}): string {
  const envRoot = opts.envRoot === undefined ? process.env.MARS_VAULT_ROOT : opts.envRoot
  if (envRoot) return envRoot
  for (const registry of opts.registryPaths ?? DEFAULT_REGISTRY_PATHS) {
    for (const entry of readRegistry(registry)) if (path.basename(entry.path) === 'Mars' && isDir(path.join(entry.path, 'content'))) return entry.path
  }
  const candidates = [
    path.join(os.homedir(), 'Projects', 'mars-vault', 'Mars'),
    path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Mars', 'Mars'),
  ]
  return candidates.find(candidate => isDir(path.join(candidate, 'content'))) ?? candidates[0]
}

export function readRegistry(file: string): { id: string; path: string; open: boolean; ts?: number }[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { vaults?: Record<string, { path?: unknown; open?: unknown; ts?: unknown }> }
    return Object.entries(parsed.vaults ?? {}).filter(([, value]) => typeof value?.path === 'string').map(([id, value]) => ({ id, path: path.resolve(String(value.path)), open: value.open === true, ...(typeof value.ts === 'number' ? { ts: value.ts } : {}) }))
  } catch { return [] }
}
