interface SupabaseStats {
  totalUsers: number
  signupsToday: number
  signupsWeek: number
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
      }
    }
  } catch (e) {
    console.error('Supabase error:', e)
  }

  return { totalUsers, signupsToday, signupsWeek }
}
