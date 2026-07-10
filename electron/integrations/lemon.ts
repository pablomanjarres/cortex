const LEMON_API = 'https://api.lemonsqueezy.com/v1'
const PAGE_SIZE = 100
const MAX_PAGES = 10

interface LemonStats {
  mrr: number
  totalCustomers: number
  newThisMonth: number
  churnedThisMonth: number
  revenueThisMonth: number
}

interface LemonListResponse {
  data?: LemonResource[]
  meta?: { page?: { currentPage?: number; lastPage?: number } }
  links?: { next?: string }
}

interface LemonResource {
  attributes?: {
    status?: string
    created_at?: string
    updated_at?: string
    variant_name?: string
    product_name?: string
    total?: number
    first_subscription_item?: { price?: number }
  }
}

async function lemonFetch(endpoint: string, apiKey: string): Promise<LemonListResponse> {
  const res = await fetch(`${LEMON_API}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/vnd.api+json',
    },
  })
  if (!res.ok) throw new Error(`Lemon Squeezy API ${res.status}: ${res.statusText}`)
  return res.json() as Promise<LemonListResponse>
}

/**
 * Paginate a JSON:API list endpoint via page[number]/page[size], following
 * meta.page/links.next, capped at MAX_PAGES. `stop` allows early exit once a
 * page can no longer contain relevant rows (requires a sorted endpoint).
 */
async function lemonFetchAll(
  basePath: string,
  apiKey: string,
  stop?: (page: LemonResource[]) => boolean,
): Promise<LemonResource[]> {
  const out: LemonResource[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const sep = basePath.includes('?') ? '&' : '?'
    const body = await lemonFetch(`${basePath}${sep}page[number]=${page}&page[size]=${PAGE_SIZE}`, apiKey)
    const batch = body.data ?? []
    out.push(...batch)
    if (stop && stop(batch)) break
    const lastPage = body.meta?.page?.lastPage
    if (typeof lastPage === 'number' && page >= lastPage) break
    if (!body.links?.next && batch.length < PAGE_SIZE) break
    if (batch.length === 0) break
  }
  return out
}

export async function getLemonStats(apiKey: string, rawStoreId: string): Promise<LemonStats> {
  const storeId = rawStoreId.replace(/\D/g, '')
  if (!storeId) throw new Error('Invalid store ID — no digits found')

  // Month boundary in UTC — Lemon created_at/updated_at are UTC timestamps.
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  // ALL subscriptions (every status), fully paginated — the old single-page
  // fetch silently capped everything at ~10 subs.
  const allSubs = await lemonFetchAll(`/subscriptions?filter[store_id]=${storeId}`, apiKey)

  const activeSubs = allSubs.filter((s) => s.attributes?.status === 'active')

  // MRR from active subscriptions (annual plans normalized to monthly)
  let mrr = 0
  for (const sub of activeSubs) {
    const price = sub.attributes?.first_subscription_item?.price ?? 0
    const combined = `${sub.attributes?.variant_name ?? ''} ${sub.attributes?.product_name ?? ''}`.toLowerCase()
    const isAnnual = combined.includes('annual') || combined.includes('yearly') || combined.includes('year')
    mrr += (isAnnual ? price / 12 : price) / 100
  }

  const totalCustomers = activeSubs.length

  const newThisMonth = allSubs.filter((s) => {
    const created = new Date(s.attributes?.created_at ?? '')
    return !isNaN(created.getTime()) && created >= monthStart
  }).length

  const churnedThisMonth = allSubs.filter((s) => {
    const status = s.attributes?.status
    const updated = new Date(s.attributes?.updated_at ?? '')
    return (status === 'cancelled' || status === 'expired') && !isNaN(updated.getTime()) && updated >= monthStart
  }).length

  // Orders newest-first; stop paginating once a page ends before month start.
  const orders = await lemonFetchAll(
    `/orders?filter[store_id]=${storeId}&sort=-createdAt`,
    apiKey,
    (page) => {
      const oldest = page[page.length - 1]?.attributes?.created_at
      return !!oldest && new Date(oldest) < monthStart
    },
  )
  let revenueThisMonth = 0
  for (const order of orders) {
    const created = new Date(order.attributes?.created_at ?? '')
    if (!isNaN(created.getTime()) && created >= monthStart) {
      revenueThisMonth += (order.attributes?.total ?? 0) / 100
    }
  }

  return { mrr, totalCustomers, newThisMonth, churnedThisMonth, revenueThisMonth }
}
