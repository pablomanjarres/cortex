// One function per protection check, each reading its own section of the
// runtime's health report. The runtime owns the statuses; these only read
// them, and report a check as unknown when the runtime is silent about it.

import { formatElapsed } from '../../lib/date-utils'

export type Tone = 'ok' | 'warning' | 'danger' | 'unknown'
export type CheckGroup = 'Sync' | 'Backups' | 'Evidence'

export interface ProtectionCheck {
  id: string
  group: CheckGroup
  label: string
  tone: Tone
  status: string
  detail: string
  /** ISO time the check refers to, when reported */
  at: string | null
}

const MIN = 60
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const LOCAL_SNAPSHOT_STALE = 2 * HOUR
const CLOUD_CHECKPOINT_STALE = 6 * HOUR
const QUICK_CHECK_STALE = 9 * DAY
const FULL_CHECK_STALE = 35 * DAY
const RESTORE_STALE = 35 * DAY

// ── Defensive readers: the report is runtime-owned JSON ─────────────────────

export type Obj = Record<string, unknown>
export const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : null)
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
export const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
export const iso = (v: unknown): string | null => {
  const s = str(v)
  return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null
}
const hasError = (section: Obj | null) => section != null && section.error != null && section.error !== ''
const ageOf = (at: string | null, now: Date) => (at ? Math.max(0, (now.getTime() - Date.parse(at)) / 1000) : null)
export const syncObservationCurrent = (sync: Obj | null, now: Date): boolean => {
  const age = ageOf(iso(sync?.updated_at), now)
  return age != null && age <= 10 * MIN
}
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Relative time for a reported age; "Not reported" when the runtime is silent. */
export function formatAge(seconds: number | null): string {
  return seconds == null ? 'Not reported' : formatElapsed(seconds)
}

const notReported = (id: string, group: CheckGroup, label: string): ProtectionCheck =>
  ({ id, group, label, tone: 'unknown', status: 'Not reported', detail: 'The runtime has not reported this check.', at: null })

// ── Checks ──────────────────────────────────────────────────────────────────

export function macSync(sync: Obj | null): ProtectionCheck {
  if (!sync) return notReported('mac', 'Sync', 'Mac')
  const at = iso(sync.updated_at)
  if (bool(sync.available) === false) {
    return { id: 'mac', group: 'Sync', label: 'Mac', tone: 'danger', status: 'Unavailable', detail: 'The Mac sync service is not responding.', at }
  }
  const pending = num(sync.mac_needs_items)
  const pullErrors = num(sync.pull_errors) ?? 0
  if (pullErrors > 0) {
    return { id: 'mac', group: 'Sync', label: 'Mac', tone: 'danger', status: 'Errors', detail: `${plural(pullErrors, 'item')} failed to sync.`, at }
  }
  if (pending == null) return { id: 'mac', group: 'Sync', label: 'Mac', tone: 'unknown', status: 'Connected', detail: 'Pending items not reported.', at }
  if (pending > 0) return { id: 'mac', group: 'Sync', label: 'Mac', tone: 'warning', status: 'Syncing', detail: `${plural(pending, 'item')} waiting to arrive.`, at }
  return { id: 'mac', group: 'Sync', label: 'Mac', tone: 'ok', status: 'Up to date', detail: 'Nothing waiting to sync.', at }
}

export function windowsSync(sync: Obj | null, now: Date): ProtectionCheck {
  const win = obj(sync?.windows)
  if (!win) return notReported('windows', 'Sync', 'Windows')
  const lastSeen = iso(win.last_seen)
  if (bool(win.configured) === false) {
    return { id: 'windows', group: 'Sync', label: 'Windows', tone: 'warning', status: 'Not set up', detail: 'The Windows PC is not paired.', at: null }
  }
  const connected = bool(win.connected)
  if (connected !== true) {
    return {
      id: 'windows', group: 'Sync', label: 'Windows', tone: connected === false ? 'danger' : 'unknown',
      status: connected === false ? 'Offline' : 'Unknown',
      detail: lastSeen ? `Last seen ${formatAge(ageOf(lastSeen, now))}.` : 'Never seen.', at: lastSeen,
    }
  }
  const pending = num(win.pending_items)
  if (pending == null) return { id: 'windows', group: 'Sync', label: 'Windows', tone: 'unknown', status: 'Connected', detail: 'Pending items not reported.', at: lastSeen }
  if (pending > 0) {
    const pct = num(win.completion_pct)
    return { id: 'windows', group: 'Sync', label: 'Windows', tone: 'warning', status: 'Syncing', detail: `${plural(pending, 'item')} waiting${pct != null ? ` · ${Math.round(pct)}% complete` : ''}.`, at: lastSeen }
  }
  return { id: 'windows', group: 'Sync', label: 'Windows', tone: 'ok', status: 'Up to date', detail: 'Connected and fully synced.', at: lastSeen }
}

export function conflictsCheck(sync: Obj | null): ProtectionCheck {
  const conflicts = num(sync?.conflicts)
  if (conflicts == null) return notReported('conflicts', 'Sync', 'Conflicts')
  if (conflicts > 0) return { id: 'conflicts', group: 'Sync', label: 'Conflicts', tone: 'danger', status: plural(conflicts, 'conflict'), detail: 'Two edits collided; resolve them in the vault.', at: iso(sync?.updated_at) }
  return { id: 'conflicts', group: 'Sync', label: 'Conflicts', tone: 'ok', status: 'None', detail: 'No conflicting edits.', at: iso(sync?.updated_at) }
}

export function localSnapshot(local: Obj | null, now: Date): ProtectionCheck {
  if (!local) return notReported('local', 'Backups', 'Local snapshot')
  const at = iso(local.last_snapshot_time)
  if (hasError(local)) return { id: 'local', group: 'Backups', label: 'Local snapshot', tone: 'danger', status: 'Failed', detail: 'The last local snapshot attempt failed.', at }
  if (!at) return { id: 'local', group: 'Backups', label: 'Local snapshot', tone: 'unknown', status: 'None yet', detail: 'No local snapshot recorded.', at }
  const age = ageOf(at, now) ?? 0
  if (age > LOCAL_SNAPSHOT_STALE) return { id: 'local', group: 'Backups', label: 'Local snapshot', tone: 'warning', status: 'Overdue', detail: `Last snapshot ${formatAge(age)}.`, at }
  const files = num(local.total_files)
  return { id: 'local', group: 'Backups', label: 'Local snapshot', tone: 'ok', status: 'Current', detail: files != null ? `${plural(files, 'file')} on this Mac.` : 'Snapshot taken on this Mac.', at }
}

export function cloudCheckpoint(cloud: Obj | null, now: Date): ProtectionCheck {
  if (!cloud) return notReported('cloud', 'Backups', 'Cloud checkpoint')
  const at = iso(cloud.verified_checkpoint_time)
  const since = at ? `Last verified checkpoint ${formatAge(ageOf(at, now))}.` : 'No checkpoint verified yet.'
  const state = str(cloud.upload_state)
  const uploadErrors = num(cloud.upload_errors) ?? 0
  if (hasError(cloud) || uploadErrors > 0 || state === 'error' || state === 'failed') {
    return { id: 'cloud', group: 'Backups', label: 'Cloud checkpoint', tone: 'danger', status: 'Upload failed', detail: since, at }
  }
  if (state !== 'verified') {
    const pendingSince = iso(cloud.pending_since)
    const waiting = state == null ? 'Not reported' : state === 'uploading' ? 'Uploading' : 'Pending'
    return {
      id: 'cloud', group: 'Backups', label: 'Cloud checkpoint', tone: state == null ? 'unknown' : 'warning', status: waiting,
      detail: `${pendingSince ? `Waiting since ${formatAge(ageOf(pendingSince, now))}. ` : ''}${since}`, at,
    }
  }
  if (!at) return { id: 'cloud', group: 'Backups', label: 'Cloud checkpoint', tone: 'unknown', status: 'Unverified', detail: since, at }
  const age = ageOf(at, now) ?? 0
  if (age > CLOUD_CHECKPOINT_STALE) return { id: 'cloud', group: 'Backups', label: 'Cloud checkpoint', tone: 'warning', status: 'Overdue', detail: since, at }
  const files = num(cloud.files)
  const verified = num(cloud.files_verified)
  if (files != null && verified != null && verified < files) {
    return { id: 'cloud', group: 'Backups', label: 'Cloud checkpoint', tone: 'warning', status: 'Partly verified', detail: `${verified} of ${plural(files, 'file')} verified in the cloud.`, at }
  }
  return { id: 'cloud', group: 'Backups', label: 'Cloud checkpoint', tone: 'ok', status: 'Verified', detail: verified != null ? `${plural(verified, 'file')} verified in the cloud.` : 'Verified in the cloud.', at }
}

export function integrityCheck(integrity: Obj | null, now: Date): ProtectionCheck {
  if (!integrity) return notReported('integrity', 'Evidence', 'Integrity')
  const full = iso(integrity.last_full_check)
  const at = iso(integrity.last_quick_check) ?? full
  if (hasError(integrity)) return { id: 'integrity', group: 'Evidence', label: 'Integrity', tone: 'danger', status: 'Failed', detail: 'The last integrity check found a problem.', at }
  if (!at || !full) return { id: 'integrity', group: 'Evidence', label: 'Integrity', tone: 'unknown', status: 'Not proven', detail: 'Weekly and full integrity checks have not both been recorded.', at }
  const quickAge = ageOf(at, now) ?? 0
  const fullAge = ageOf(full, now) ?? 0
  const detail = `Weekly check ${formatAge(quickAge)}; full read ${formatAge(fullAge)}.`
  if (quickAge > QUICK_CHECK_STALE || fullAge > FULL_CHECK_STALE) return { id: 'integrity', group: 'Evidence', label: 'Integrity', tone: 'warning', status: 'Overdue', detail, at }
  return { id: 'integrity', group: 'Evidence', label: 'Integrity', tone: 'ok', status: 'Passed', detail, at }
}

export function restoreCheck(restore: Obj | null, now: Date): ProtectionCheck {
  if (!restore) return notReported('restore', 'Evidence', 'Restore test')
  const local = bool(restore.drill_local_ok)
  const cloud = bool(restore.drill_cloud_ok)
  const independent = bool(restore.independent_cloud_restore_ok)
  const at = iso(restore.last_cloud_restore) ?? iso(restore.last_drill)
  if (hasError(restore) || local === false || cloud === false || independent === false) {
    return { id: 'restore', group: 'Evidence', label: 'Restore test', tone: 'danger', status: 'Failed', detail: 'A restore test did not reproduce the vault.', at }
  }
  if (local !== true || cloud !== true || !at) {
    return { id: 'restore', group: 'Evidence', label: 'Restore test', tone: 'unknown', status: 'Not proven', detail: 'Local and cloud restores have not both been tested.', at }
  }
  const age = ageOf(at, now) ?? 0
  if (age > RESTORE_STALE) return { id: 'restore', group: 'Evidence', label: 'Restore test', tone: 'warning', status: 'Overdue', detail: `Last restore test ${formatAge(age)}.`, at }
  return {
    id: 'restore', group: 'Evidence', label: 'Restore test', tone: 'ok', status: 'Passed',
    detail: independent === true ? 'Restored from local and cloud copies, including an independent cloud restore.' : 'Restored from local and cloud copies.', at,
  }
}

export function recoveryCheck(recovery: Obj | null): ProtectionCheck {
  if (!recovery) return notReported('recovery', 'Evidence', 'Recovery copy')
  const manager = str(recovery.manager) ?? 'password manager'
  const at = iso(recovery.verified_at)
  const verified = bool(recovery.manager_copy_verified)
  if (hasError(recovery) || verified === false) {
    return { id: 'recovery', group: 'Evidence', label: 'Recovery copy', tone: 'danger', status: 'Not verified', detail: `The backup password copy in ${manager} is not confirmed.`, at }
  }
  if (verified !== true) return { id: 'recovery', group: 'Evidence', label: 'Recovery copy', tone: 'unknown', status: 'Not reported', detail: `No confirmation of the copy in ${manager}.`, at }
  return { id: 'recovery', group: 'Evidence', label: 'Recovery copy', tone: 'ok', status: 'Verified', detail: `Backup password copy confirmed in ${manager}.`, at }
}
