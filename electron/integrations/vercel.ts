const VERCEL_API = 'https://api.vercel.com'
const DEPLOYMENTS_CAP = 300

interface VercelStats {
  deploymentsToday: number
  deploymentsWeek: number
  latestDeployment: { state: string; url: string; createdAt: string } | null
  pageviews: number | null
  visitors: number | null
}

interface VercelDeployment {
  uid?: string
  created?: number
  createdAt?: number
  state?: string
  readyState?: string
  url?: string
}

interface DeploymentsResponse {
  deployments?: VercelDeployment[]
  pagination?: { next?: number | null }
}

// NOTE: unconfigured (no token in keychain) is the CALLER's concern — this
// module is only invoked with a real token. Any fetch failure here THROWS,
// so the refresher can distinguish "not set up" from "erroring".
async function vercelFetch<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${VERCEL_API}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

/** Every deployment since `sinceMs` (newest first), paginated, capped. */
async function listDeploymentsSince(token: string, sinceMs: number): Promise<VercelDeployment[]> {
  const seen = new Set<string>()
  const out: VercelDeployment[] = []
  let until: number | undefined

  while (out.length < DEPLOYMENTS_CAP) {
    const params = new URLSearchParams({ limit: '100', since: String(sinceMs) })
    if (until !== undefined) params.set('until', String(until))
    const body = await vercelFetch<DeploymentsResponse>(`/v6/deployments?${params}`, token)
    const batch = body.deployments ?? []
    for (const d of batch) {
      const id = d.uid ?? `${d.url}-${d.created}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push(d)
    }
    const next = body.pagination?.next
    if (!next || batch.length === 0) break
    until = next
  }
  return out
}

function createdMs(d: VercelDeployment): number {
  return d.created ?? d.createdAt ?? 0
}

export async function getVercelStats(token: string): Promise<VercelStats> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  // Monday (local) of the current week — "this week" matches the app-wide convention.
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const weekStart = monday.getTime()

  const deployments = (await listDeploymentsSince(token, weekStart))
    .sort((a, b) => createdMs(b) - createdMs(a))

  const deploymentsWeek = deployments.length
  const deploymentsToday = deployments.filter((d) => createdMs(d) >= todayStart).length

  const latest = deployments[0]
  const latestDeployment = latest
    ? {
        state: latest.state || latest.readyState || 'unknown',
        url: latest.url || '',
        createdAt: new Date(createdMs(latest)).toISOString(),
      }
    : null

  // Web analytics is best-effort (not available on all plans) — never throws.
  let pageviews: number | null = null
  let visitors: number | null = null
  try {
    const analyticsRes = await fetch(`${VERCEL_API}/v1/web/analytics?from=${todayStart}&to=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (analyticsRes.ok) {
      const analytics = await analyticsRes.json() as {
        pageviews?: number; totalPageviews?: number; visitors?: number; totalVisitors?: number
      }
      pageviews = analytics.pageviews ?? analytics.totalPageviews ?? null
      visitors = analytics.visitors ?? analytics.totalVisitors ?? null
    }
  } catch {
    // Analytics API not available
  }

  return { deploymentsToday, deploymentsWeek, latestDeployment, pageviews, visitors }
}
