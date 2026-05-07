// Persistent data store:
// 1. Electron IPC (JSON files in data/) — desktop app
// 2. HTTP API (/api/data) — browser/iPhone via web server (any port, any proxy)
// 3. localStorage — dev mode fallback

import { useState, useEffect, useCallback, useRef } from 'react'

const pending = new Map<string, ReturnType<typeof setTimeout>>()

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
      if (res.ok) { _apiBase = base; return base }
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
if (!isElectron()) { getApiBase() }

// Adaptive debounce
function getDebounceMs(data: unknown): number {
  try {
    const size = JSON.stringify(data).length
    if (size > 100_000) return 1000
    if (size > 10_000) return 500
    return 150
  } catch { return 300 }
}

export async function readStore<T>(key: string, fallback: T): Promise<T> {
  // 1. Electron IPC
  if (isElectron()) {
    const data = await window.electronAPI!.data.read(key)
    if (data !== null) return data as T
    return fallback
  }

  // 2. HTTP API
  const api = await getApiBase()
  if (api !== null) {
    try {
      const res = await fetch(`${api}/api/data?key=${encodeURIComponent(key)}`)
      if (res.ok) {
        const data = await res.json()
        if (data !== null) return data as T
      }
    } catch { /* fall through */ }
  }

  // 3. localStorage fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }

  return fallback
}

// Batch queue
let batchQueue = new Map<string, unknown>()
let batchScheduled = false

function flushBatch() {
  const entries = new Map(batchQueue)
  batchQueue = new Map()
  batchScheduled = false
  for (const [key, data] of entries) {
    if (isElectron()) {
      window.electronAPI!.data.write(key, data)
    } else {
      const api = getApiBaseSync()
      if (api !== null) {
        fetch(`${api}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, data }),
        }).catch(() => { /* silent */ })
      } else {
        try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* quota */ }
      }
    }
  }
}

export function writeStore<T>(key: string, data: T): void {
  if (pending.has(key)) clearTimeout(pending.get(key))
  const delay = getDebounceMs(data)
  pending.set(key, setTimeout(() => {
    pending.delete(key)
    batchQueue.set(key, data)
    if (!batchScheduled) {
      batchScheduled = true
      queueMicrotask(flushBatch)
    }
  }, delay))
}

// Flush pending writes before page unload to prevent data loss
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    for (const timer of pending.values()) clearTimeout(timer)
    pending.clear()
    flushBatch()
  })
}

// Track keys that were just written locally so we skip the next poll cycle
const recentWrites = new Map<string, number>()
const WRITE_COOLDOWN = 3000 // ms to skip polling after a local write

/** React hook for persistent state with automatic sync */
export function useStore<T>(key: string, fallback: T): [T, (fn: (prev: T) => T) => void] {
  const [data, setData] = useState<T>(fallback)
  const snapshotRef = useRef<string>('')

  const reload = useCallback(() => {
    // Skip if we just wrote locally (avoid overwriting our own write with stale read)
    const lastWrite = recentWrites.get(key)
    if (lastWrite && Date.now() - lastWrite < WRITE_COOLDOWN) return

    readStore<T>(key, fallback).then((v) => {
      const json = JSON.stringify(v)
      // Only update state if data actually changed (avoids unnecessary re-renders)
      if (json !== snapshotRef.current) {
        snapshotRef.current = json
        setData(v)
      }
    })
  }, [key])

  // Initial load (always runs, ignoring cooldown)
  useEffect(() => {
    readStore<T>(key, fallback).then((v) => {
      snapshotRef.current = JSON.stringify(v)
      setData(v)
    })
  }, [key])

  // Auto-sync: poll every 2s for changes from other devices
  useEffect(() => {
    const interval = setInterval(reload, 2000)
    return () => clearInterval(interval)
  }, [reload])

  // Also re-read on visibility/focus (immediate sync when switching back)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [reload])

  const update = useCallback((fn: (prev: T) => T) => {
    setData((prev) => {
      const next = fn(prev)
      snapshotRef.current = JSON.stringify(next)
      recentWrites.set(key, Date.now())
      writeStore(key, next)
      return next
    })
  }, [key])

  return [data, update]
}
