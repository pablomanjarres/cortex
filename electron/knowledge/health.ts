// Read-only view of the knowledge runtime's own health file. The runtime
// writes it independently; Cortex only reports what is there.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_HEALTH_FILE = path.join(os.homedir(), 'Library', 'Application Support', 'Eightfold', 'health.json')
const MAX_BYTES = 256 * 1024

export type KnowledgeHealth =
  | { status: 'ok'; readAt: string; modifiedAt: string; ageSeconds: number; health: Record<string, unknown> }
  | { status: 'missing' | 'invalid'; readAt: string; error: string }

export function readKnowledgeHealth(file = DEFAULT_HEALTH_FILE, now = new Date()): KnowledgeHealth {
  const readAt = now.toISOString()
  let stat: fs.Stats
  try { stat = fs.statSync(file) } catch { return { status: 'missing', readAt, error: 'The runtime has not written a health file yet.' } }
  if (!stat.isFile() || stat.size > MAX_BYTES) return { status: 'invalid', readAt, error: 'The health file is not a readable JSON file.' }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    return { status: 'ok', readAt, modifiedAt: new Date(stat.mtimeMs).toISOString(), ageSeconds: Math.max(0, Math.round((now.getTime() - stat.mtimeMs) / 1000)), health: parsed as Record<string, unknown> }
  } catch {
    return { status: 'invalid', readAt, error: 'The health file is not valid JSON.' }
  }
}
