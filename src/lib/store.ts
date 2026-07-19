// Persistent data store:
// 1. Electron IPC (encrypted JSON files) — desktop app. Push-based: main
//    broadcasts `data:changed` after every write, so there is NO polling here.
// 2. HTTP API (/api/data) — browser/iPhone via the web server. One shared
//    module-level poller (~5s) batch-fetches only the registered keys.
// 3. localStorage — dev mode fallback.
//
// Writes go through a per-key rebase queue: update(reducer) applies the
// reducer optimistically, then a debounced flush writes base+ops with the
// key's baseRev (optimistic concurrency). On a 409 conflict the server's
// value becomes the new base, pending ops are re-applied on top, and the
// write retries (max 3, then last-write-wins).

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Backend surface ───────────────────────────────────────

type Reducer = (prev: unknown) => unknown

interface DataChangedPayload {
  key: string
  source: 'ipc' | 'http' | 'main'
  rev: string | null
}

interface IpcWriteResult {
  ok?: boolean
  conflict?: boolean
  rev?: string | null
  data?: unknown
  error?: string
}

// The current preload data surface. The ambient ElectronAPI declaration still
// carries the legacy shapes, so we cast through this locally.
interface ElectronDataApi {
  read: (key: string) => Promise<unknown>
  readWithRev: (key: string) => Promise<{ data: unknown; rev: string | null } | null>
  write: (key: string, data: unknown, baseRev?: string | null) => Promise<IpcWriteResult | boolean>
  onDataChanged?: (cb: (payload: DataChangedPayload) => void) => () => void
}

function electronData(): ElectronDataApi | null {
  const data = window.electronAPI?.data
  return data ? (data as unknown as ElectronDataApi) : null
}

const isElectron = () => !!window.electronAPI?.data

// Detect the API base URL once — works through any reverse proxy
let _apiBase: string | null | undefined = undefined // undefined = not checked yet

async function getApiBase(): Promise<string | null> {
  if (_apiBase !== undefined) return _apiBase
  if (isElectron()) { _apiBase = null; return null }

  // Try relative path first (works through proxies with path prefix like /cortex)
  // Probe /api/data/keys to see if the API is reachable
  const candidates = [
    '', // same origin, no prefix
  ]

  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/api/data/keys`, { signal: AbortSignal.timeout(2000) })
      // A 200 alone is not proof of a live API: SPA-fallback servers answer
      // every path with 200 + index.html, which would put the store into a
      // phantom-API mode that swallows writes. Require a real JSON body.
      if (res.ok) {
        const body = await res.json().catch(() => null)
        if (body !== null && typeof body === 'object') { _apiBase = base; return base }
      }
    } catch { /* try next */ }
  }

  _apiBase = null
  return null
}

function getApiBaseSync(): string | null {
  if (_apiBase !== undefined) return _apiBase
  return null
}

// Kick off API detection immediately on load
if (typeof window !== 'undefined' && !isElectron()) { getApiBase() }

// ─── Per-key sync state (module level, shared across hooks) ─

interface KeySync {
  base: unknown            // last server-confirmed value (null = key missing)
  rev: string | null       // rev of `base` (file mtimeMs as string)
  hasBase: boolean         // base loaded at least once
  epoch: number            // bumped on every accepted base; guards stale async reads
  pending: Reducer[]       // optimistic ops not yet confirmed by a write
  opsFallback: unknown     // fallback ops are applied over while the key is missing
  effCache: { epoch: number; opsLen: number; value: unknown } | null
  timer: ReturnType<typeof setTimeout> | null
  flushing: boolean
  failures: number         // consecutive hard write failures
}

const syncs = new Map<string, KeySync>()
// key → hook listeners. A listener receives the raw effective value (may be null).
const listeners = new Map<string, Set<(raw: unknown) => void>>()
const inflightLoads = new Map<string, Promise<void>>()

const MAX_CONFLICT_RETRIES = 3
const MAX_WRITE_FAILURES = 5
const HTTP_POLL_MS = 5000
const BATCH_CHUNK = 100

function getSync(key: string): KeySync {
  let s = syncs.get(key)
  if (!s) {
    s = {
      base: null, rev: null, hasBase: false, epoch: 0,
      pending: [], opsFallback: null, effCache: null,
      timer: null, flushing: false, failures: 0,
    }
    syncs.set(key, s)
  }
  return s
}

/**
 * base (or the updater's fallback while missing) with pending ops applied.
 * Cached per (epoch, pending-length) so reducers run exactly once per state —
 * an impure reducer that mutates `prev` in place must not compound across the
 * multiple places that read the effective value. The base is cloned before
 * ops are applied so in-place mutations never corrupt the confirmed base.
 */
function effectiveValue(s: KeySync): unknown {
  if (s.pending.length === 0) return s.base
  if (s.effCache && s.effCache.epoch === s.epoch && s.effCache.opsLen === s.pending.length) {
    return s.effCache.value
  }
  let v = s.base ?? s.opsFallback
  try { v = structuredClone(v) } catch { /* non-cloneable — apply over the original */ }
  for (const op of s.pending) v = op(v)
  s.effCache = { epoch: s.epoch, opsLen: s.pending.length, value: v }
  return v
}

function notify(key: string) {
  const subs = listeners.get(key)
  if (!subs || subs.size === 0) return
  const raw = effectiveValue(getSync(key))
  for (const cb of subs) cb(raw)
}

/** Accept a fresh server-confirmed base for a key (bumps the epoch). */
function acceptBase(key: string, data: unknown, rev: string | null) {
  const s = getSync(key)
  s.base = data
  s.rev = rev
  s.hasBase = true
  s.epoch++
  notify(key)
}

// ─── Backend read/write ────────────────────────────────────

async function backendRead(key: string): Promise<{ data: unknown; rev: string | null }> {
  const el = electronData()
  if (el) {
    try {
      const r = await el.readWithRev(key)
      return { data: r?.data ?? null, rev: r?.rev ?? null }
    } catch { return { data: null, rev: null } }
  }

  const api = await getApiBase()
  if (api !== null) {
    try {
      const res = await fetch(`${api}/api/data?key=${encodeURIComponent(key)}`)
      if (res.ok) {
        return { data: await res.json(), rev: res.headers.get('X-Cortex-Rev') }
      }
    } catch { /* fall through */ }
  }

  try {
    const raw = localStorage.getItem(key)
    if (raw) return { data: JSON.parse(raw), rev: null }
  } catch { /* ignore */ }
  return { data: null, rev: null }
}

type BackendWriteResult =
  | { ok: true; rev: string | null }
  | { ok: false; conflict: true; rev: string | null; data: unknown }
  | { ok: false; conflict?: false }

async function backendWrite(key: string, data: unknown, baseRev: string | null): Promise<BackendWriteResult> {
  const el = electronData()
  if (el) {
    try {
      const res = await el.write(key, data, baseRev)
      if (res === true) return { ok: true, rev: null } // pre-rev main builds
      if (res && typeof res === 'object') {
        const r = res as IpcWriteResult
        if (r.ok) return { ok: true, rev: r.rev ?? null }
        if (r.conflict) return { ok: false, conflict: true, rev: r.rev ?? null, data: r.data ?? null }
      }
      return { ok: false }
    } catch { return { ok: false } }
  }

  const api = await getApiBase()
  if (api !== null) {
    try {
      const res = await fetch(`${api}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseRev !== null ? { key, data, baseRev } : { key, data }),
      })
      if (res.ok) {
        let rev: string | null = null
        try { rev = ((await res.json()) as { rev?: string } | null)?.rev ?? null } catch { /* legacy body */ }
        return { ok: true, rev }
      }
      if (res.status === 409) {
        try {
          const body = (await res.json()) as { rev?: string | null; data?: unknown }
          return { ok: false, conflict: true, rev: body?.rev ?? null, data: body?.data ?? null }
        } catch { return { ok: false } }
      }
      return { ok: false }
    } catch { return { ok: false } }
  }

  try { localStorage.setItem(key, JSON.stringify(data)); return { ok: true, rev: null } } catch { return { ok: false } }
}

/** Reload a key's base from the backend (deduped; stale results discarded). */
function loadKey(key: string): Promise<void> {
  const inflight = inflightLoads.get(key)
  if (inflight) return inflight
  const epochAtStart = getSync(key).epoch
  const p = backendRead(key)
    .then(({ data, rev }) => {
      // If a write confirmed (or a fresher base landed) meanwhile, this read is stale.
      if (getSync(key).epoch !== epochAtStart) return
      acceptBase(key, data, rev)
    })
    .finally(() => { inflightLoads.delete(key) })
  inflightLoads.set(key, p)
  return p
}

// ─── Write pipeline (rebase queue + debounced flush) ───────

// Adaptive debounce
function getDebounceMs(data: unknown): number {
  try {
    const size = JSON.stringify(data).length
    if (size > 100_000) return 1000
    if (size > 10_000) return 500
    return 150
  } catch { return 300 }
}

function reportStoreError(key: string) {
  try {
    window.dispatchEvent(new CustomEvent('cortex:store-error', { detail: { key } }))
  } catch { /* ignore */ }
}

function scheduleFlush(key: string, delayOverride?: number) {
  const s = getSync(key)
  if (s.timer) clearTimeout(s.timer)
  const delay = delayOverride ?? getDebounceMs(effectiveValue(s))
  s.timer = setTimeout(() => {
    s.timer = null
    void flushKey(key)
  }, delay)
}

function enqueueUpdate(key: string, op: Reducer, fallback: unknown) {
  const s = getSync(key)
  s.opsFallback = fallback
  s.pending.push(op)
  notify(key) // optimistic local apply
  // Seed the base so the flush can send a baseRev instead of a blind write.
  if (!s.hasBase && !inflightLoads.has(key)) void loadKey(key)
  scheduleFlush(key)
}

async function flushKey(key: string): Promise<void> {
  const s = getSync(key)
  if (s.flushing || s.pending.length === 0) return
  s.flushing = true
  try {
    if (!s.hasBase) {
      try { await loadKey(key) } catch { /* proceed rev-less */ }
    }
    let conflicts = 0
    while (s.pending.length > 0) {
      const ops = s.pending.slice()
      const final = effectiveValue(s) // base + all currently-pending ops (cached)

      const lastWriteWins = conflicts > MAX_CONFLICT_RETRIES
      if (lastWriteWins) {
        console.warn(`[store] "${key}": still conflicting after ${MAX_CONFLICT_RETRIES} rebases — falling back to last-write-wins`)
      }
      const result = await backendWrite(key, final, lastWriteWins ? null : s.rev)

      if (result.ok) {
        s.pending.splice(0, ops.length) // ops enqueued during the await stay queued
        s.failures = 0
        acceptBase(key, final, result.rev)
        continue // flush anything that arrived mid-write
      }

      if (result.conflict) {
        conflicts++
        // Rebase: the server's value becomes the base; pending ops stay queued
        // and are re-applied on top (both for the retry write and the UI).
        acceptBase(key, result.data ?? null, result.rev)
        continue
      }

      // Hard failure (IPC error / HTTP non-409 error / network down)
      s.failures++
      console.warn(`[store] write failed for "${key}" (attempt ${s.failures})`)
      reportStoreError(key)
      if (s.failures >= MAX_WRITE_FAILURES) {
        console.warn(`[store] "${key}": dropping ${s.pending.length} pending update(s) after ${s.failures} failed writes`)
        s.pending = []
        s.failures = 0
      } else {
        scheduleFlush(key, 5000) // retry later
      }
      break
    }
  } finally {
    s.flushing = false
    if (s.pending.length > 0 && !s.timer) scheduleFlush(key, 250)
  }
}

// ─── Push-based updates (Electron) ─────────────────────────

function handleDataChanged(payload: DataChangedPayload) {
  if (!payload || typeof payload.key !== 'string') return
  // 'ipc' = this window's own write echo (we already confirmed it in flushKey).
  if (payload.source === 'ipc') return
  const key = payload.key
  const s = syncs.get(key)
  const hasSubs = (listeners.get(key)?.size ?? 0) > 0
  if (!s && !hasSubs) return
  if (s && payload.rev !== null && payload.rev === s.rev) return // already current
  // Re-read the base; pending local ops are rebased on top via effectiveValue.
  void loadKey(key)
}

if (typeof window !== 'undefined') {
  const el = electronData()
  el?.onDataChanged?.(handleDataChanged)
}

// ─── Shared HTTP poller (browser/iPhone clients — no IPC push) ─

let httpPollerStarted = false

function startHttpPollerIfNeeded() {
  if (httpPollerStarted || typeof window === 'undefined' || isElectron()) return
  httpPollerStarted = true
  setInterval(() => { void pollRegisteredKeys() }, HTTP_POLL_MS)
}

async function pollRegisteredKeys(): Promise<void> {
  const api = await getApiBase()
  if (api === null) return
  const keys = [...listeners.entries()].filter(([, subs]) => subs.size > 0).map(([k]) => k)
  if (keys.length === 0) return

  for (let i = 0; i < keys.length; i += BATCH_CHUNK) {
    const chunk = keys.slice(i, i + BATCH_CHUNK)
    const epochs = new Map(chunk.map((k) => [k, getSync(k).epoch]))
    try {
      const res = await fetch(`${api}/api/data/batch?keys=${encodeURIComponent(chunk.join(','))}`)
      if (!res.ok) continue
      const body = (await res.json()) as { values?: Record<string, unknown>; revs?: Record<string, string | null> }
      for (const key of chunk) {
        const s = getSync(key)
        if (s.epoch !== epochs.get(key)) continue // a write/reload landed meanwhile
        const rev = body.revs?.[key] ?? null
        if (s.hasBase && rev !== null && rev === s.rev) continue // unchanged
        acceptBase(key, body.values?.[key] ?? null, rev)
      }
    } catch { /* server temporarily unreachable */ }
  }
}

// ─── Focus / visibility reload ─────────────────────────────

function reloadAllRegistered() {
  if (isElectron()) {
    for (const [key, subs] of listeners) {
      if (subs.size > 0) void loadKey(key)
    }
  } else {
    void pollRegisteredKeys()
  }
}

if (typeof window !== 'undefined') {
  const onVisible = () => {
    if (document.visibilityState === 'visible') reloadAllRegistered()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
}

// ─── Flush pending writes before unload ────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    for (const [key, s] of syncs) {
      if (s.pending.length === 0) continue
      if (s.timer) { clearTimeout(s.timer); s.timer = null }
      const final = effectiveValue(s)
      s.pending = []
      s.effCache = null
      const el = electronData()
      if (el) {
        // Rev-less on purpose: a conflict can't be rebased mid-unload.
        void el.write(key, final, null)
      } else {
        const api = getApiBaseSync()
        if (api !== null) {
          try {
            void fetch(`${api}/api/data`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key, data: final }),
              keepalive: true, // survives the page teardown
            })
          } catch { /* nothing else we can do */ }
        } else {
          try { localStorage.setItem(key, JSON.stringify(final)) } catch { /* quota */ }
        }
      }
    }
  })
}

// ─── Public API ────────────────────────────────────────────

export async function readStore<T>(key: string, fallback: T): Promise<T> {
  const { data } = await backendRead(key)
  return (data ?? fallback) as T
}

/**
 * Read a key together with its backend rev. Lets callers tell a key that has
 * never been written (data null, rev null) apart from one whose file exists
 * but is currently unreadable (data null, rev non-null) — e.g. a corrupt or
 * undecryptable data file that should NOT be treated as absent.
 */
export async function readStoreWithRev<T>(key: string): Promise<{ data: T | null; rev: string | null }> {
  const { data, rev } = await backendRead(key)
  return { data: (data ?? null) as T | null, rev }
}

/** Fire-and-forget write, routed through the same rebase/flush pipeline as useStore. */
export function writeStore<T>(key: string, data: T): void {
  enqueueUpdate(key, () => data, data)
}

/** Fire-and-forget functional update outside React, same rebase/flush pipeline as useStore. */
export function updateStoreValue<T>(key: string, fallback: T, reducer: (prev: T) => T): void {
  enqueueUpdate(key, (prev) => reducer((prev === null || prev === undefined ? fallback : prev) as T), fallback)
}

/** React hook for persistent state with automatic cross-writer sync. */
export function useStore<T>(key: string, fallback: T): [T, (updater: T | ((prev: T) => T)) => void] {
  const [data, setData] = useState<T>(fallback)
  const fallbackRef = useRef(fallback)
  const prevKeyRef = useRef<string | null>(null)

  // Track the latest fallback without retriggering the subscription effect
  // (inline literals change identity every render).
  useEffect(() => { fallbackRef.current = fallback })

  useEffect(() => {
    let active = true
    let lastJson = ''

    const apply = (raw: unknown) => {
      if (!active) return
      const v = (raw === null || raw === undefined ? fallbackRef.current : raw) as T
      const json = JSON.stringify(v)
      if (json === lastJson) return // unchanged — skip the re-render
      lastJson = json
      setData(v)
    }

    // Key changed between renders: reset to the fallback until the new key loads.
    if (prevKeyRef.current !== null && prevKeyRef.current !== key) {
      setData(fallbackRef.current)
    }
    prevKeyRef.current = key

    let subs = listeners.get(key)
    if (!subs) { subs = new Set(); listeners.set(key, subs) }
    subs.add(apply)
    startHttpPollerIfNeeded()

    // Hydrate from the shared cache immediately, then refresh from the backend.
    const s = getSync(key)
    if (s.hasBase || s.pending.length > 0) apply(effectiveValue(s))
    void loadKey(key)

    return () => {
      active = false
      const set = listeners.get(key)
      if (set) {
        set.delete(apply)
        if (set.size === 0) listeners.delete(key)
      }
    }
  }, [key])

  const update = useCallback((updater: T | ((prev: T) => T)) => {
    // Tolerate plain values: wrap them as a constant reducer.
    const op: Reducer = typeof updater === 'function'
      ? (prev) => (updater as (p: T) => T)((prev === null || prev === undefined ? fallbackRef.current : prev) as T)
      : () => updater
    enqueueUpdate(key, op, fallbackRef.current)
  }, [key])

  return [data, update]
}
