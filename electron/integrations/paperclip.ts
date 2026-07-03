// Paperclip REST client. Mirrors github.ts: stateless fetch wrappers keyed
// off a token + base URL. Token retrieval lives in main.ts (keychain).

const DEFAULT_BASE_URL = 'http://100.121.121.114:3100'

export interface PaperclipCompany { id: string; name: string; slug?: string; createdAt?: string }
export interface PaperclipAgent { id: string; companyId: string; name: string; status?: string; lastHeartbeatAt?: string | null; createdAt?: string }
export interface PaperclipHeartbeatRun { id: string; agentId: string; status: string; startedAt: string; finishedAt?: string | null; exitCode?: number | null; error?: string | null }
export interface PaperclipActivity { id: string; agentId?: string; kind?: string; message?: string; createdAt: string }
export interface PaperclipLiveRun { id: string; agentId: string; startedAt: string; status: string }

export interface PaperclipClientOptions {
  baseUrl?: string
  token: string
  timeoutMs?: number
}

export interface PaperclipClient {
  baseUrl: string
  health(): Promise<{ ok: boolean }>
  listCompanies(): Promise<PaperclipCompany[]>
  listAgents(companyId: string): Promise<PaperclipAgent[]>
  listHeartbeatRuns(companyId: string, limit?: number): Promise<PaperclipHeartbeatRun[]>
  listActivity(companyId: string, limit?: number): Promise<PaperclipActivity[]>
  liveRuns(companyId: string): Promise<PaperclipLiveRun[]>
}

async function pcFetch(baseUrl: string, endpoint: string, token: string, timeoutMs: number) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'Cortex-Dashboard',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Paperclip API ${res.status}: ${res.statusText}`)
  return res.json()
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export function createPaperclipClient(opts: PaperclipClientOptions): PaperclipClient {
  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const token = opts.token
  const timeoutMs = opts.timeoutMs ?? 6000
  if (!token) throw new Error('Paperclip: missing token')
  const get = (endpoint: string) => pcFetch(baseUrl, endpoint, token, timeoutMs)
  const enc = encodeURIComponent

  return {
    baseUrl,
    async health() {
      try { await get('/api/companies'); return { ok: true } }
      catch { return { ok: false } }
    },
    async listCompanies() {
      return asArray<PaperclipCompany>(await get('/api/companies'))
    },
    async listAgents(companyId: string) {
      if (!companyId) return []
      return asArray<PaperclipAgent>(await get(`/api/companies/${enc(companyId)}/agents`))
    },
    async listHeartbeatRuns(companyId: string, limit = 20) {
      if (!companyId) return []
      return asArray<PaperclipHeartbeatRun>(await get(`/api/companies/${enc(companyId)}/heartbeat-runs?limit=${limit}`))
    },
    async listActivity(companyId: string, limit = 30) {
      if (!companyId) return []
      return asArray<PaperclipActivity>(await get(`/api/companies/${enc(companyId)}/activity?limit=${limit}`))
    },
    async liveRuns(companyId: string) {
      if (!companyId) return []
      return asArray<PaperclipLiveRun>(await get(`/api/companies/${enc(companyId)}/live-runs`))
    },
  }
}
