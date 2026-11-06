import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchKnowledgeHealth, HEALTH_POLL_MS } from './eightfold-health'
import { buildProtectionView, type ProtectionView } from './eightfold-view'

interface KnowledgeHealthState {
  view: ProtectionView | null
  refreshing: boolean
  refresh: () => void
}

/**
 * Reads the protection report once a minute and on demand. One request at a
 * time: a manual refresh cancels the in-flight read and restarts the timer.
 */
export function useKnowledgeHealth(): KnowledgeHealthState {
  const [view, setView] = useState<ProtectionView | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const run = useRef<() => void>(() => {})

  useEffect(() => {
    let disposed = false
    let controller: AbortController | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const load = async () => {
      if (timer) clearTimeout(timer)
      controller?.abort()
      const current = new AbortController()
      controller = current
      setRefreshing(true)
      try {
        const response = await fetchKnowledgeHealth(current.signal)
        if (!disposed && !current.signal.aborted) setView(buildProtectionView(response))
      } catch {
        // Aborted by a newer read or by unmount; that read owns the state.
      } finally {
        if (!disposed && controller === current) {
          setRefreshing(false)
          timer = setTimeout(load, HEALTH_POLL_MS)
        }
      }
    }

    run.current = () => { void load() }
    void load()
    return () => {
      disposed = true
      controller?.abort()
      if (timer) clearTimeout(timer)
      run.current = () => {}
    }
  }, [])

  const refresh = useCallback(() => run.current(), [])
  return { view, refreshing, refresh }
}
