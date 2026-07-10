const PER_PAGE = 1000
const MAX_PAGES = 20 // sane cap: 20k users before the count becomes a floor

interface SupabaseStats {
  totalUsers: number
  signupsToday: number
  signupsWeek: number
  /** Cumulative total users by actual signup date (real cohort curve, 180d). */
  signupTimeline?: { date: string; users: number }[]
}

interface AdminUser { created_at?: string }

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Cumulative user count per day, from first signup (capped to 180d) to today. */
function buildSignupTimeline(createdAts: Date[]): { date: string; users: number }[] {
  const dates = createdAts.filter(d => !isNaN(d.getTime())).sort((a, b) => a.getTime() - b.getTime())
  if (!dates.length) return []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const firstDay = new Date(dates[0].getFullYear(), dates[0].getMonth(), dates[0].getDate())
  const cap = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 179)
  const start = firstDay < cap ? cap : firstDay

  const out: { date: string; users: number }[] = []
  for (const day = new Date(start); day <= today; day.setDate(day.getDate() + 1)) {
    const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
    const cumulative = dates.filter(d => d < endOfDay).length
    out.push({ date: localDate(day), users: cumulative })
  }
  return out
}

/**
 * Fetch every auth user via the GoTrue admin API, paginated (no silent
 * 1000-user cap). Auth/admin failures THROW — never zeros-as-success, so a
 * bad service key can no longer poison the cache and history with zeros.
 */
async function fetchAllUsers(url: string, serviceKey: string): Promise<{ users: AdminUser[]; total: number }> {
  const users: AdminUser[] = []
  let headerTotal: number | null = null

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    })
    if (!res.ok) throw new Error(`Supabase admin API ${res.status}: ${res.statusText}`)

    const totalHeader = res.headers.get('x-total-count')
    if (totalHeader !== null) {
      const parsed = parseInt(totalHeader, 10)
      if (Number.isFinite(parsed)) headerTotal = parsed
    }

    const body = await res.json() as { users?: AdminUser[] }
    if (!Array.isArray(body.users)) throw new Error('Supabase admin API: unexpected response shape')
    users.push(...body.users)

    if (body.users.length < PER_PAGE) break
    if (headerTotal !== null && users.length >= headerTotal) break
  }

  // Prefer the server's exact count when it exceeds what we paged (cap hit).
  const total = headerTotal !== null ? Math.max(headerTotal, users.length) : users.length
  return { users, total }
}

export async function getSupabaseStats(url: string, serviceKey: string): Promise<SupabaseStats> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(now.getTime() - 7 * 86400000)

  const { users, total } = await fetchAllUsers(url, serviceKey)

  const createdAts = users.map(u => new Date(u.created_at ?? ''))
  const signupsToday = createdAts.filter(d => !isNaN(d.getTime()) && d >= todayStart).length
  const signupsWeek = createdAts.filter(d => !isNaN(d.getTime()) && d >= weekStart).length
  const signupTimeline = buildSignupTimeline(createdAts)

  return { totalUsers: total, signupsToday, signupsWeek, signupTimeline }
}
