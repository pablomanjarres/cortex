// Shared Eightfold health reports for the System page tests. Shapes follow the
// runtime's health.json; values are synthetic.

export const NOW = new Date('2026-10-18T08:10:00Z')

export function healthyReport(): Record<string, unknown> {
  return {
    schema: 1,
    overall: 'ok',
    updated_at: '2026-10-18T08:08:24Z',
    errors: [],
    sync: {
      available: true, error: null, folder_state: 'idle', conflicts: 0, mac_needs_items: 0, pull_errors: 0,
      updated_at: '2026-10-18T08:08:24Z',
      windows: { configured: true, connected: true, last_seen: '2026-10-18T08:08:24Z', pending_items: 0, completion_pct: 100 },
    },
    backup_local: { error: null, last_snapshot_time: '2026-10-18T07:25:23Z', total_files: 122 },
    backup_cloud: {
      error: null, upload_state: 'verified', upload_errors: 0, uploading: 0, pending_since: null,
      files: 19, files_verified: 19, verified_checkpoint_time: '2026-10-18T07:25:23Z',
    },
    integrity: { error: null, last_full_check: '2026-10-18T07:14:42Z' },
    restore: {
      error: null, drill_local_ok: true, drill_cloud_ok: true, independent_cloud_restore_ok: true,
      last_drill: '2026-10-18T07:05:49Z', last_cloud_restore: '2026-10-18T07:14:42Z',
    },
    recovery: { error: null, manager: 'Apple Passwords', manager_copy_verified: true, verified_at: '2026-10-18T07:12:42Z' },
  }
}

type Patch = Record<string, Record<string, unknown> | unknown>

/** A healthy report with selected sections shallow-merged. */
export function reportWith(patch: Patch): Record<string, unknown> {
  const base = healthyReport()
  for (const [key, value] of Object.entries(patch)) {
    const current = base[key]
    base[key] = value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object'
      ? { ...current, ...value }
      : value
  }
  return base
}

/** The /api/knowledge/health response wrapping a report of the given age. */
export function okResponse(health: Record<string, unknown>, ageSeconds = 96, now = NOW) {
  return {
    status: 'ok' as const,
    readAt: now.toISOString(),
    modifiedAt: new Date(now.getTime() - ageSeconds * 1000).toISOString(),
    ageSeconds,
    health,
  }
}
