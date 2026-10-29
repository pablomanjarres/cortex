import { useCallback, useEffect, useRef, useState } from 'react'
import {
  errorMessage, fetchBlackoutHosts, setBlackout,
  type BlackoutHostKey, type BlackoutHostState,
} from './blackout-api'

const POLL_INTERVAL_MS = 15_000

export interface BlackoutWriteError {
  message: string
  /** The value that was requested, so the same request can be retried. */
  desired: boolean
}

export interface BlackoutHostView extends BlackoutHostState {
  /** Target value of a write still being verified; undefined when idle. */
  pending?: boolean
  writeError?: BlackoutWriteError
  /** True when the current state is verified, readable, and no write is in flight. */
  canWrite: boolean
}

type ByHost<T> = Partial<Record<BlackoutHostKey, T>>

/**
 * Owns the blackout status for every host: a non-overlapping 15s poll plus
 * per-host writes. A poll never overwrites a host whose write overlapped it,
 * and nothing is shown as changed until the server reports it.
 */
export function useScreenBlackout() {
  const [hosts, setHosts] = useState<BlackoutHostState[] | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [pending, setPending] = useState<ByHost<boolean>>({})
  const [writeErrors, setWriteErrors] = useState<ByHost<BlackoutWriteError>>({})

  const mounted = useRef(true)
  const pollController = useRef<AbortController | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const writeControllers = useRef(new Set<AbortController>())
  const pendingHosts = useRef(new Set<BlackoutHostKey>())
  const writeSeq = useRef<ByHost<number>>({})

  const schedule = useCallback((run: () => void) => {
    if (pollTimer.current) clearTimeout(pollTimer.current)
    pollTimer.current = mounted.current ? setTimeout(run, POLL_INTERVAL_MS) : null
  }, [])

  const refresh = useCallback(async function poll(): Promise<void> {
    pollController.current?.abort()
    if (pollTimer.current) clearTimeout(pollTimer.current)
    const controller = new AbortController()
    pollController.current = controller
    const seqAtStart = { ...writeSeq.current }
    try {
      const incoming = await fetchBlackoutHosts(controller.signal)
      if (controller.signal.aborted || !mounted.current) return
      setHosts((current) => incoming.map((next) => {
        const raced = pendingHosts.current.has(next.host) || writeSeq.current[next.host] !== seqAtStart[next.host]
        return (raced && current?.find((entry) => entry.host === next.host)) || next
      }))
      setStatusError(null)
    } catch (error) {
      // Aborted polls were superseded; whoever aborted them owns the next poll.
      if (controller.signal.aborted || !mounted.current) return
      setStatusError(errorMessage(error))
    } finally {
      if (pollController.current === controller) {
        pollController.current = null
        if (!controller.signal.aborted) schedule(() => void poll())
      }
    }
  }, [schedule])

  useEffect(() => {
    mounted.current = true
    const writes = writeControllers.current
    void refresh()
    return () => {
      mounted.current = false
      pollController.current?.abort()
      if (pollTimer.current) clearTimeout(pollTimer.current)
      for (const controller of writes) controller.abort()
      writes.clear()
    }
  }, [refresh])

  const write = useCallback(async (host: BlackoutHostKey, enabled: boolean) => {
    if (pendingHosts.current.has(host)) return
    pendingHosts.current.add(host)
    writeSeq.current[host] = (writeSeq.current[host] ?? 0) + 1
    // Any poll already in flight read the state from before this write.
    const inFlightPoll = pollController.current
    if (inFlightPoll) {
      inFlightPoll.abort()
      pollController.current = null
      schedule(() => void refresh())
    }
    setPending((current) => ({ ...current, [host]: enabled }))
    setWriteErrors((current) => ({ ...current, [host]: undefined }))

    const controller = new AbortController()
    writeControllers.current.add(controller)
    let failed = false
    try {
      const verified = await setBlackout(host, enabled, controller.signal)
      if (!mounted.current) return
      setHosts((current) => current?.map((entry) => (entry.host === host ? { ...entry, ...verified, host } : entry)) ?? current)
    } catch (error) {
      if (!mounted.current) return
      failed = true
      setHosts((current) => current?.map(entry => entry.host === host ? { ...entry, enabled: null, available: false } : entry) ?? current)
      setWriteErrors((current) => ({ ...current, [host]: { message: errorMessage(error), desired: enabled } }))
    } finally {
      writeControllers.current.delete(controller)
      pendingHosts.current.delete(host)
      // A poll that overlapped any part of this write may hold pre-write state.
      writeSeq.current[host] = (writeSeq.current[host] ?? 0) + 1
      if (mounted.current) {
        setPending((current) => ({ ...current, [host]: undefined }))
        // The request may have partly applied; show what the host actually reports.
        if (failed) void refresh()
      }
    }
  }, [refresh, schedule])

  const stale = statusError !== null
  const views: BlackoutHostView[] | null = hosts?.map((entry) => ({
    ...entry,
    pending: pending[entry.host],
    writeError: writeErrors[entry.host],
    canWrite: !stale && entry.available && entry.enabled !== null && pending[entry.host] === undefined,
  })) ?? null
  const writable = (host: BlackoutHostKey) => views?.find((entry) => entry.host === host)?.canWrite === true

  return {
    hosts: views,
    loading: hosts === null && statusError === null,
    statusError,
    refresh: () => void refresh(),
    setEnabled: (host: BlackoutHostKey, enabled: boolean) => {
      if (writable(host)) void write(host, enabled)
    },
    /** Re-sends the request that failed for this host. */
    retry: (host: BlackoutHostKey) => {
      const failure = writeErrors[host]
      if (failure && writable(host)) void write(host, failure.desired)
    },
  }
}
