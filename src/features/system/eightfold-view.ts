import type { KnowledgeHealth } from './eightfold-health'
import {
  cloudCheckpoint, conflictsCheck, formatAge, integrityCheck, iso, localSnapshot, macSync, num, obj,
  plural, recoveryCheck, restoreCheck, str, windowsSync, type ProtectionCheck,
} from './eightfold-checks'

export { type CheckGroup, type ProtectionCheck, type Tone } from './eightfold-checks'

// Turns the runtime's health report into what the System page shows, and
// refuses to call anything protected when the report is old, absent, or
// silent about a check.

export type ProtectionState = 'ok' | 'attention' | 'stale' | 'unknown' | 'missing' | 'unavailable'

export interface ProtectionView {
  state: ProtectionState
  headline: string
  note: string
  /** When the runtime last wrote its report */
  reportAt: string | null
  reportAgeSeconds: number | null
  macPending: number | null
  windowsPending: number | null
  conflicts: number | null
  cloudCheckpointAt: string | null
  checks: ProtectionCheck[]
}

/** A report older than this no longer describes the current state. */
export const REPORT_STALE_SECONDS = 30 * 60

const HEADLINES: Record<ProtectionState, string> = {
  ok: 'Protected',
  attention: 'Needs attention',
  stale: 'Report is stale',
  unknown: 'Partly unknown',
  missing: 'No report yet',
  unavailable: 'Unavailable',
}

// ── View ────────────────────────────────────────────────────────────────────

const empty = (state: ProtectionState, note: string): ProtectionView => ({
  state, headline: HEADLINES[state], note, reportAt: null, reportAgeSeconds: null,
  macPending: null, windowsPending: null, conflicts: null, cloudCheckpointAt: null, checks: [],
})

/** Build the panel view from the endpoint response (null = Cortex unreachable). */
export function buildProtectionView(response: KnowledgeHealth | null, now = new Date()): ProtectionView {
  if (!response) return empty('unavailable', 'Cortex could not read the protection report. It will try again within a minute.')
  if (response.status === 'missing') return empty('missing', 'Eightfold has not written a protection report on this Mac yet.')
  if (response.status !== 'ok') return empty('unavailable', 'The protection report could not be read.')

  const h = response.health
  const sync = obj(h.sync)
  const cloud = obj(h.backup_cloud)
  const checks = [
    macSync(sync),
    windowsSync(sync, now),
    conflictsCheck(sync),
    localSnapshot(obj(h.backup_local), now),
    cloudCheckpoint(cloud, now),
    integrityCheck(obj(h.integrity), now),
    restoreCheck(obj(h.restore), now),
    recoveryCheck(obj(h.recovery)),
  ]
  const ageSeconds = num(response.ageSeconds)
  const stale = ageSeconds == null || ageSeconds > REPORT_STALE_SECONDS
  const runtimeErrors = Array.isArray(h.errors) ? h.errors.length : 0
  const runtimeOverall = str(h.overall)

  let state: ProtectionState
  let note: string
  if (stale) {
    state = 'stale'
    note = `The last report is from ${formatAge(ageSeconds)}; these results may no longer hold.`
  } else if (checks.some((c) => c.tone === 'danger' || c.tone === 'warning') || runtimeErrors > 0 || (runtimeOverall != null && runtimeOverall !== 'ok')) {
    state = 'attention'
    note = runtimeErrors > 0 ? `The runtime reported ${plural(runtimeErrors, 'error')}.` : 'Some checks need a look.'
  } else if (checks.some((c) => c.tone === 'unknown') || runtimeOverall == null) {
    state = 'unknown'
    note = 'Some checks have not been reported.'
  } else {
    state = 'ok'
    note = 'Synced, backed up, and restore-tested.'
  }

  const win = obj(sync?.windows)
  // Offline: pending_items is the backlog waiting for Windows to come back.
  return {
    state,
    headline: HEADLINES[state],
    note,
    reportAt: iso(response.modifiedAt),
    reportAgeSeconds: ageSeconds,
    macPending: num(sync?.mac_needs_items),
    windowsPending: num(win?.pending_items),
    conflicts: num(sync?.conflicts),
    cloudCheckpointAt: iso(cloud?.verified_checkpoint_time),
    // A stale report proves nothing is currently fine.
    checks: stale ? checks.map((c) => (c.tone === 'ok' ? { ...c, tone: 'unknown' as const } : c)) : checks,
  }
}
