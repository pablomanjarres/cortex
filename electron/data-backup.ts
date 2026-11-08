import fs from 'node:fs'
import path from 'node:path'

/** The filesystem calls the backup step uses — injectable for tests. */
export type BackupFs = Pick<typeof fs.promises, 'readFile' | 'writeFile' | 'mkdir' | 'readdir' | 'unlink'>

export type BackupResult = 'ok' | 'timeout' | 'skipped' | 'error'

export interface BackupOptions {
  key: string
  /** The key's current file, copied as-is (encrypted bytes). */
  file: string
  backupDir: string
  /** Versioned backups kept per key. */
  keep: number
  /** How long the caller waits before moving on without the backup. */
  timeoutMs: number
  fs?: BackupFs
}

// Keys whose previous backup is still running (e.g. stuck on a slow or
// cloud-evicted file). New backups of those keys are skipped, not stacked.
const inFlight = new Set<string>()

async function copyAndPrune(
  { key, file, backupDir, keep, fs: io = fs.promises }: BackupOptions,
  gaveUp: () => boolean,
) {
  // Read the previous bytes first. If that read only finishes after the caller gave up, the
  // write may already have replaced the file, so these bytes might be the new version: skip.
  const previous = await io.readFile(file)
  if (gaveUp()) return
  await io.mkdir(backupDir, { recursive: true })
  await io.writeFile(path.join(backupDir, `${key}.bak.json`), previous)
  const versionsDir = path.join(backupDir, 'versions', key)
  await io.mkdir(versionsDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  await io.writeFile(path.join(versionsDir, `${timestamp}.json`), previous)
  const versions = (await io.readdir(versionsDir)).sort().reverse()
  for (const v of versions.slice(keep)) {
    try { await io.unlink(path.join(versionsDir, v)) } catch { /* ignore */ }
  }
}

/**
 * Best-effort .bak + versioned backup of a key's previous file. Never throws
 * and never waits longer than `timeoutMs`, so a slow filesystem cannot hold
 * the caller's write lock. A timed-out copy keeps running in the background.
 */
export async function backupPreviousVersion(opts: BackupOptions): Promise<BackupResult> {
  if (inFlight.has(opts.key)) return 'skipped'
  inFlight.add(opts.key)
  let timedOut = false
  const work = copyAndPrune(opts, () => timedOut).then(
    () => 'ok' as const,
    (e) => {
      console.warn(`[Cortex] backup failed for "${opts.key}":`, e)
      return 'error' as const
    },
  ).finally(() => inFlight.delete(opts.key))

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), opts.timeoutMs)
    timer.unref?.()
  })
  const result = await Promise.race([work, timeout])
  clearTimeout(timer)
  if (result === 'timeout') {
    timedOut = true
    console.warn(`[Cortex] backup for "${opts.key}" exceeded ${opts.timeoutMs}ms; writing without waiting for it`)
  }
  return result
}
