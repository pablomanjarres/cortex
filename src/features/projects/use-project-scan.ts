import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectInfo } from '@/types/electron'
import { scanProjects } from './project-api'

/**
 * Scans once on mount and on demand. Only the latest scan may update state, so an
 * unmounted page or a superseded scan never overwrites a newer result.
 */
export function useProjectScan() {
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null)
  const [loading, setLoading] = useState(true)
  const latest = useRef<object | null>(null)

  const load = useCallback((request: object) => scanProjects()
    .then((result) => { if (latest.current === request) setProjects(result) })
    .catch((error) => { if (latest.current === request) console.error('Failed to scan projects:', error) })
    .finally(() => { if (latest.current === request) setLoading(false) }), [])

  const start = useCallback(() => {
    const request = {}
    latest.current = request
    return load(request)
  }, [load])

  useEffect(() => {
    void start()
    const scans = latest
    return () => { scans.current = null }
  }, [start])

  const rescan = useCallback(() => {
    setLoading(true)
    return start()
  }, [start])

  return { projects, loading, rescan }
}
