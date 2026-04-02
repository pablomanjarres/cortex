const GITHUB_API = 'https://api.github.com'

interface GitHubStats {
  commitsToday: number
  commitsWeek: number
  prsOpen: number
  prsMerged: number
  latestCommit: string | null
  repoCount: number
  streak: number
  topRepos: { name: string; commits: number }[]
}

async function ghFetch(endpoint: string, token: string) {
  const res = await fetch(`${GITHUB_API}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Cortex-Dashboard',
    },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)
  return res.json()
}

async function getAccessibleRepos(token: string): Promise<string[]> {
  // Returns all repos: personal + org (works with classic and fine-grained tokens)
  const repoSet = new Set<string>()

  // 1. User repos (personal + collaborator + org member)
  let page = 1
  while (true) {
    try {
      const batch = await ghFetch(`/user/repos?sort=pushed&per_page=100&visibility=all&affiliation=owner,collaborator,organization_member&page=${page}`, token)
      if (!batch.length) break
      for (const repo of batch) repoSet.add(repo.full_name)
      if (batch.length < 100) break
      page++
    } catch { break }
  }

  // 2. Also fetch org repos directly (in case fine-grained token has org access but /user/repos misses them)
  try {
    const orgs = await ghFetch('/user/orgs?per_page=100', token)
    for (const org of orgs) {
      try {
        let orgPage = 1
        while (true) {
          const batch = await ghFetch(`/orgs/${org.login}/repos?sort=pushed&per_page=100&type=all&page=${orgPage}`, token)
          if (!batch.length) break
          for (const repo of batch) repoSet.add(repo.full_name)
          if (batch.length < 100) break
          orgPage++
        }
      } catch { /* org access denied, skip */ }
    }
  } catch { /* no org access */ }

  return [...repoSet]
}

export async function getGitHubStats(token: string): Promise<GitHubStats> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString()

  // Get all repos the token can access
  const allRepos = await getAccessibleRepos(token)

  // Only check repos pushed to in the last 7 days to avoid hitting rate limits
  const recentRepos: string[] = []
  for (const repoName of allRepos) {
    try {
      const repo = await ghFetch(`/repos/${repoName}`, token)
      if (repo.pushed_at && new Date(repo.pushed_at) >= new Date(weekStart)) {
        recentRepos.push(repoName)
      }
    } catch {
      // skip repos we can't access
    }
    // Cap at 50 most recent repos to stay within rate limits
    if (recentRepos.length >= 50) break
  }

  let commitsToday = 0
  let commitsWeek = 0
  let prsOpen = 0
  let prsMerged = 0
  let latestCommit: string | null = null
  const repoCommitCounts: Record<string, number> = {}

  for (const repo of recentRepos) {
    try {
      // Paginate today's commits
      let todayCount = 0
      let commitPage = 1
      while (true) {
        const batch = await ghFetch(`/repos/${repo}/commits?since=${todayStart}&per_page=100&page=${commitPage}`, token)
        todayCount += batch.length
        if (!latestCommit && batch.length > 0) {
          latestCommit = batch[0].commit?.message?.split('\n')[0] || null
        }
        if (batch.length < 100) break
        commitPage++
      }
      commitsToday += todayCount

      // Paginate week's commits
      let weekCount = 0
      commitPage = 1
      while (true) {
        const batch = await ghFetch(`/repos/${repo}/commits?since=${weekStart}&per_page=100&page=${commitPage}`, token)
        weekCount += batch.length
        if (batch.length < 100) break
        commitPage++
      }
      commitsWeek += weekCount
      repoCommitCounts[repo.split('/').pop() || repo] = weekCount

      const openPrs = await ghFetch(`/repos/${repo}/pulls?state=open&per_page=100`, token)
      prsOpen += openPrs.length

      const closedPrs = await ghFetch(`/repos/${repo}/pulls?state=closed&since=${weekStart}&per_page=100`, token)
      prsMerged += closedPrs.filter((pr: any) => pr.merged_at).length
    } catch (e) {
      console.error(`GitHub error for ${repo}:`, e)
    }
  }

  // Top 5 repos by weekly commits
  const topRepos = Object.entries(repoCommitCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, commits]) => ({ name, commits }))

  // Calculate streak from Events API
  let streak = 0
  try {
    const user = await ghFetch('/user', token)
    const username = user.login
    const events = await ghFetch(`/users/${username}/events?per_page=100`, token)
    const pushDates = new Set<string>()
    for (const event of events) {
      if (event.type === 'PushEvent' && event.created_at) {
        pushDates.add(event.created_at.slice(0, 10))
      }
    }
    // Count consecutive days backwards from today
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    while (true) {
      const dateStr = day.toISOString().slice(0, 10)
      if (pushDates.has(dateStr)) {
        streak++
        day.setDate(day.getDate() - 1)
      } else {
        break
      }
    }
  } catch (e) {
    console.error('GitHub streak error:', e)
  }

  return { commitsToday, commitsWeek, prsOpen, prsMerged, latestCommit, repoCount: allRepos.length, streak, topRepos }
}
