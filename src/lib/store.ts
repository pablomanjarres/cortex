// Persistent data store: uses Electron IPC (JSON files in data/) when available,
// falls back to localStorage for browser/dev mode.

import { useState, useEffect, useCallback } from 'react'

const pending = new Map<string, ReturnType<typeof setTimeout>>()

export async function readStore<T>(key: string, fallback: T): Promise<T> {
  if (window.electronAPI?.data) {
    const data = await window.electronAPI.data.read(key)
    if (data !== null) return data as T
  } else {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
  }
  return fallback
}

export function writeStore<T>(key: string, data: T): void {
  // Debounce writes to avoid hammering disk on rapid edits
  if (pending.has(key)) clearTimeout(pending.get(key))
  pending.set(key, setTimeout(() => {
    pending.delete(key)
    if (window.electronAPI?.data) {
      window.electronAPI.data.write(key, data)
    } else {
      localStorage.setItem(key, JSON.stringify(data))
    }
  }, 300))
}

/** React hook for persistent state backed by JSON files (Electron) or localStorage (browser) */
export function useStore<T>(key: string, fallback: T): [T, (fn: (prev: T) => T) => void] {
  const [data, setData] = useState<T>(fallback)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    readStore<T>(key, fallback).then((v) => { setData(v); setLoaded(true) })
  }, [key])

  const update = useCallback((fn: (prev: T) => T) => {
    setData((prev) => {
      const next = fn(prev)
      writeStore(key, next)
      return next
    })
  }, [key])

  // Write fallback on first load if no data existed
  useEffect(() => {
    if (loaded) writeStore(key, data)
  }, [loaded])

  return [data, update]
}
