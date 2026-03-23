const LEMON_API = 'https://api.lemonsqueezy.com/v1'

interface LemonStats {
  mrr: number
  totalCustomers: number
  newThisMonth: number
  churnedThisMonth: number
  revenueThisMonth: number
}

async function lemonFetch(endpoint: string, apiKey: string) {
  const res = await fetch(`${LEMON_API}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/vnd.api+json',
    },
  })
  if (!res.ok) throw new Error(`Lemon Squeezy API ${res.status}: ${res.statusText}`)
  return res.json()
}

export async function getLemonStats(apiKey: string, rawStoreId: string): Promise<LemonStats> {
  const storeId = rawStoreId.replace(/\D/g, '')
  if (!storeId) throw new Error('Invalid store ID — no digits found')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Get all active subscriptions
  const subs = await lemonFetch(`/subscriptions?filter[store_id]=${storeId}&filter[status]=active`, apiKey)
  const allSubs = subs.data || []

  // Calculate MRR
  let mrr = 0
  for (const sub of allSubs) {
    const price = sub.attributes?.first_subscription_item?.price || 0
    const variantName = String(sub.attributes?.variant_name || '')
    const productName = String(sub.attributes?.product_name || '')
    const combined = `${variantName} ${productName}`.toLowerCase()
    const isAnnual = combined.includes('annual') || combined.includes('yearly') || combined.includes('year')
    const monthly = isAnnual ? price / 12 : price
    mrr += monthly / 100
  }

  const totalCustomers = allSubs.length

  // Get ALL subscriptions (no date filter) and filter in code
  const allSubsResp = await lemonFetch(`/subscriptions?filter[store_id]=${storeId}&per_page=100`, apiKey)
  const allSubsList = allSubsResp.data || []

  const newThisMonth = allSubsList.filter((s: any) => {
    const created = new Date(s.attributes?.created_at)
    return created >= monthStart
  }).length

  const churnedThisMonth = allSubsList.filter((s: any) => {
    const status = s.attributes?.status
    const updated = new Date(s.attributes?.updated_at)
    return (status === 'cancelled' || status === 'expired') && updated >= monthStart
  }).length

  // Get orders and filter in code
  const ordersResp = await lemonFetch(`/orders?filter[store_id]=${storeId}&per_page=100`, apiKey)
  let revenueThisMonth = 0
  for (const order of (ordersResp.data || [])) {
    const created = new Date(order.attributes?.created_at)
    if (created >= monthStart) {
      revenueThisMonth += (order.attributes?.total || 0) / 100
    }
  }

  return { mrr, totalCustomers, newThisMonth, churnedThisMonth, revenueThisMonth }
}
