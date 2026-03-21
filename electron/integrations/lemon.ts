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
      'Content-Type': 'application/vnd.api+json',
    },
  })
  if (!res.ok) throw new Error(`Lemon Squeezy API ${res.status}: ${res.statusText}`)
  return res.json()
}

export async function getLemonStats(apiKey: string, storeId: string): Promise<LemonStats> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Get all active subscriptions
  const subs = await lemonFetch(`/subscriptions?filter[store_id]=${storeId}&filter[status]=active`, apiKey)
  const allSubs = subs.data || []

  // Calculate MRR from active subscriptions
  let mrr = 0
  for (const sub of allSubs) {
    const price = sub.attributes?.first_subscription_item?.price || 0
    const interval = sub.attributes?.billing_anchor || sub.attributes?.variant_name || ''
    // Price is in cents
    const monthly = interval.toLowerCase().includes('annual') || interval.toLowerCase().includes('yearly')
      ? price / 12
      : price
    mrr += monthly / 100 // cents to dollars
  }

  const totalCustomers = allSubs.length

  // Get new subscriptions this month
  const newSubs = await lemonFetch(`/subscriptions?filter[store_id]=${storeId}&filter[created_at]=${monthStart}..`, apiKey)
  const newThisMonth = (newSubs.data || []).length

  // Get churned this month
  const churned = await lemonFetch(`/subscriptions?filter[store_id]=${storeId}&filter[status]=cancelled&filter[updated_at]=${monthStart}..`, apiKey)
  const churnedThisMonth = (churned.data || []).length

  // Get orders this month for revenue
  const orders = await lemonFetch(`/orders?filter[store_id]=${storeId}&filter[created_at]=${monthStart}..`, apiKey)
  let revenueThisMonth = 0
  for (const order of (orders.data || [])) {
    revenueThisMonth += (order.attributes?.total || 0) / 100
  }

  return { mrr, totalCustomers, newThisMonth, churnedThisMonth, revenueThisMonth }
}
