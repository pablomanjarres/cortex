interface SupabaseStats {
  totalUsers: number
  signupsToday: number
  signupsWeek: number
  /** Cumulative total users by actual signup date (real cohort curve). */
  signupTimeline?: { date: string; users: number }[]
}

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

async function supaFetch(url: string, endpoint: string, serviceKey: string) {
  const res = await fetch(`${url}/rest/v1/${endpoint}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    },
  })
  if (!res.ok) throw new Error(`Supabase API ${res.status}: ${res.statusText}`)
  const count = res.headers.get('content-range')
  return { data: await res.json(), count: count ? parseInt(count.split('/')[1]) : 0 }
}

export async function getSupabaseStats(url: string, serviceKey: string): Promise<SupabaseStats> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString()

  // Total users — query auth.users via the admin API
  let totalUsers = 0
  let signupsToday = 0
  let signupsWeek = 0
  let signupTimeline: { date: string; users: number }[] = []

  try {
    // Use Supabase Auth Admin API
    const usersRes = await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    })
    if (usersRes.ok) {
      // The total count is in the response headers or we need to count
      const users = await usersRes.json()
      totalUsers = users.total || (users.users?.length ?? 0)

      // For detailed counts, fetch with date filter
      const allUsersRes = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      })
      if (allUsersRes.ok) {
        const allUsers = await allUsersRes.json()
        const userList = allUsers.users || []
        totalUsers = userList.length

        signupsToday = userList.filter((u: any) =>
          new Date(u.created_at) >= new Date(todayStart)
        ).length

        signupsWeek = userList.filter((u: any) =>
          new Date(u.created_at) >= new Date(weekStart)
        ).length

        signupTimeline = buildSignupTimeline(userList.map((u: any) => new Date(u.created_at)))
      }
    }
  } catch (e) {
    console.error('Supabase error:', e)
  }

  return { totalUsers, signupsToday, signupsWeek, signupTimeline }
}
