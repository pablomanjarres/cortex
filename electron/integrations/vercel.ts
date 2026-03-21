const VERCEL_API = 'https://api.vercel.com'

interface VercelStats {
  deploymentsToday: number
  deploymentsWeek: number
  latestDeployment: { state: string; url: string; createdAt: string } | null
  pageviews: number | null
  visitors: number | null
}

async function vercelFetch(endpoint: string, token: string) {
  const res = await fetch(`${VERCEL_API}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${res.statusText}`)
  return res.json()
}

export async function getVercelStats(token: string): Promise<VercelStats> {
  const now = Date.now()
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
  const weekStart = now - 7 * 86400000

  // Get deployments
  const deps = await vercelFetch(`/v6/deployments?limit=50&since=${weekStart}`, token)
  const deployments = deps.deployments || []

  const deploymentsToday = deployments.filter((d: any) => d.created >= todayStart).length
  const deploymentsWeek = deployments.length

  const latestDeployment = deployments.length > 0
    ? {
        state: deployments[0].state || deployments[0].readyState || 'unknown',
        url: deployments[0].url || '',
        createdAt: new Date(deployments[0].created).toISOString(),
      }
    : null

  // Try to get web analytics (may not be available on all plans)
  let pageviews: number | null = null
  let visitors: number | null = null

  try {
    // Vercel Web Analytics API
    const analyticsRes = await fetch(`${VERCEL_API}/v1/web/analytics?from=${todayStart}&to=${now}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (analyticsRes.ok) {
      const analytics = await analyticsRes.json()
      pageviews = analytics.pageviews || analytics.totalPageviews || null
      visitors = analytics.visitors || analytics.totalVisitors || null
    }
  } catch {
    // Analytics API not available
  }

  return { deploymentsToday, deploymentsWeek, latestDeployment, pageviews, visitors }
}
