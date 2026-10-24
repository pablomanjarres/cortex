import { useEffect, useRef, useState } from 'react'
import { API_BASE } from './api-base'

export type HostKey = 'mac'

export function systemApiUrl(path: string): string {
  return `${API_BASE}${path}`
}

interface PollState<T> {
  url: string
  data: T | null
  error: string | null
}

/**
 * Polls a JSON endpoint on a fixed interval. A failed poll keeps the last good
 * payload and reports the error; a new URL starts over with no data.
 */
export function usePolledJson<T>(url: string, intervalMs: number, onData?: (data: T) => void) {
  const [state, setState] = useState<PollState<T>>({ url, data: null, error: null })
  const onDataRef = useRef(onData)
  useEffect(() => { onDataRef.current = onData })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      try {
        const response = await fetch(url, {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = (await response.json()) as T
        if (cancelled) return
        setState({ url, data, error: null })
        onDataRef.current?.(data)
      } catch (error: unknown) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'fetch failed'
        setState((current) => ({ url, data: current.url === url ? current.data : null, error: message }))
      } finally {
        if (!cancelled) timer = setTimeout(tick, intervalMs)
      }
    }

    void tick()
    return () => {
      cancelled = true
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [url, intervalMs])

  return state.url === url ? { data: state.data, error: state.error } : { data: null, error: null }
}
