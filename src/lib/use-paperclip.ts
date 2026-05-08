import { useCallback, useEffect, useRef, useState } from 'react'

// Polls Cortex's local Express proxy at /api/integrations/paperclip/* — those
// routes get added to electron/main.ts in the wiring step
// (see docs/paperclip-integration-wiring.md). Until then, every fetch 404s and
// the hook surfaces "Paperclip not configured" — that's the unconfigured UX.

const API_BASE = (typeof window !== 'undefined' && window.location.protocol === 'file:')
  ? 'http://127.0.0.1:3456'
  : ''

export interface PaperclipCompany { id: string; name: string; slug?: string; createdAt?: string }
export interface PaperclipAgent { id: string; companyId: string; name: string; status?: string; lastHeartbeatAt?: string | null; createdAt?: string }
export interface PaperclipHeartbeatRun { id: string; agentId: string; status: string; startedAt: string; finishedAt?: string | null; exitCode?: number | null; error?: string | null }
export interface PaperclipLiveRun { id: string; agentId: string; startedAt: string; status: string }

export interface PaperclipDashboard {
  companies: PaperclipCompany[]
  agents: PaperclipAgent[]
  runs: PaperclipHeartbeatRun[]
  liveRuns: PaperclipLiveRun[]
  selectedCompanyId: string | null
  setSelectedCompanyId: (id: string | null) => void
  loading: boolean
  error: string | null
  lastFetched: Date | null
  refresh: () => void
}

type RouteShape<T> = T | { error: string } | null

async function getJson<T>(path: string): Promise<RouteShape<T>> {
  const r = await fetch(`${API_BASE}${path}`, { cache: 'no-store' })
  if (!r.ok) {
    if (r.status === 404) return { error: 'Paperclip proxy route not registered yet (main.ts wiring pending)' }
    throw new Error(`HTTP ${r.status}`)
  }
  return r.json() as Promise<RouteShape<T>>
}

const isError = <T>(v: RouteShape<T>): v is { error: string } =>
  !!v && typeof v === 'object' && 'error' in (v as Record<string, unknown>)

// Separate cadences so heavy lists don't thrash. Companies barely change;
// runs are the hot path.
const COMPANIES_INTERVAL_MS = 60_000
const AGENTS_INTERVAL_MS = 30_000
const RUNS_INTERVAL_MS = 10_000

export function usePaperclip(): PaperclipDashboard {
  const [companies, setCompanies] = useState<PaperclipCompany[]>([])
  const [agents, setAgents] = useState<PaperclipAgent[]>([])
  const [runs, setRuns] = useState<PaperclipHeartbeatRun[]>([])
  const [liveRuns, setLiveRuns] = useState<PaperclipLiveRun[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const mountedRef = useRef(true)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedCompanyId

  const fetchCompanies = useCallback(async () => {
    try {
      const data = await getJson<PaperclipCompany[]>('/api/integrations/paperclip/companies')
      if (!mountedRef.current) return
      if (isError(data)) { setError('Configure Paperclip token in Settings'); setLoading(false); return }
      const list = (data ?? []) as PaperclipCompany[]
      setCompanies(list)
      setError(null)
      if (!selectedRef.current && list.length > 0) {
        const next = list[0].id
        selectedRef.current = next
        setSelectedCompanyId(next)
      }
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to fetch Paperclip companies')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  const fetchAgents = useCallback(async () => {
    const id = selectedRef.current
    if (!id) return
    try {
      const data = await getJson<PaperclipAgent[]>(`/api/integrations/paperclip/companies/${encodeURIComponent(id)}/agents`)
      if (!mountedRef.current || isError(data)) return
      setAgents((data ?? []) as PaperclipAgent[])
    } catch { /* best-effort; companies poll surfaces auth errors */ }
  }, [])

  const fetchRuns = useCallback(async () => {
    const id = selectedRef.current
    if (!id) return
    try {
      const [hb, live] = await Promise.all([
        getJson<PaperclipHeartbeatRun[]>(`/api/integrations/paperclip/companies/${encodeURIComponent(id)}/heartbeat-runs?limit=20`),
        getJson<PaperclipLiveRun[]>(`/api/integrations/paperclip/companies/${encodeURIComponent(id)}/live-runs`),
      ])
      if (!mountedRef.current) return
      if (!isError(hb)) setRuns((hb ?? []) as PaperclipHeartbeatRun[])
      if (!isError(live)) setLiveRuns((live ?? []) as PaperclipLiveRun[])
      setLastFetched(new Date())
    } catch { /* best-effort */ }
  }, [])

  const refresh = useCallback(() => {
    fetchCompanies(); fetchAgents(); fetchRuns()
  }, [fetchCompanies, fetchAgents, fetchRuns])

  useEffect(() => {
    mountedRef.current = true
    fetchCompanies()
    const ci = setInterval(fetchCompanies, COMPANIES_INTERVAL_MS)
    return () => { mountedRef.current = false; clearInterval(ci) }
  }, [fetchCompanies])

  useEffect(() => {
    if (!selectedCompanyId) return
    fetchAgents(); fetchRuns()
    const ai = setInterval(fetchAgents, AGENTS_INTERVAL_MS)
    const ri = setInterval(fetchRuns, RUNS_INTERVAL_MS)
    return () => { clearInterval(ai); clearInterval(ri) }
  }, [selectedCompanyId, fetchAgents, fetchRuns])

  return {
    companies, agents, runs, liveRuns,
    selectedCompanyId, setSelectedCompanyId,
    loading, error, lastFetched, refresh,
  }
}
