const GITHUB_API = 'https://api.github.com'

function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface GitHubStats {
  commitsToday: number
  commitsWeek: number
  prsOpen: number
  prsMerged: number
  latestCommit: string | null
  repoCount: number
  streak: number
  topRepos: { name: string; commits: number }[]
  /** Real per-day commit counts for the last 30 days, across active repos. */
  commitTimeline: { date: string; commits: number }[]
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

/** All repos the token can see, with their last-push time (personal + org). */
async function getAccessibleRepos(token: string): Promise<{ name: string; pushedAt: string | null }[]> {
  const repos = new Map<string, string | null>()

  // 1. User repos (personal + collaborator + org member)
  let page = 1
  while (true) {
    try {
      const batch = await ghFetch(`/user/repos?sort=pushed&per_page=100&visibility=all&affiliation=owner,collaborator,organization_member&page=${page}`, token)
      if (!batch.length) break
      for (const repo of batch) repos.set(repo.full_name, repo.pushed_at ?? null)
      if (batch.length < 100) break
      page++
    } catch { break }
  }

  // 2. Org repos directly (fine-grained tokens sometimes miss these in /user/repos)
  try {
    const orgs = await ghFetch('/user/orgs?per_page=100', token)
    for (const org of orgs) {
      try {
        let orgPage = 1
        while (true) {
          const batch = await ghFetch(`/orgs/${org.login}/repos?sort=pushed&per_page=100&type=all&page=${orgPage}`, token)
          if (!batch.length) break
          for (const repo of batch) repos.set(repo.full_name, repo.pushed_at ?? null)
          if (batch.length < 100) break
          orgPage++
        }
      } catch { /* org access denied, skip */ }
    }
  } catch { /* no org access */ }

  return [...repos].map(([name, pushedAt]) => ({ name, pushedAt }))
}

/** Fetch every commit on the default branch since `sinceISO` (paginated). */
async function fetchCommitsSince(repo: string, sinceISO: string, token: string): Promise<any[]> {
  const out: any[] = []
  let page = 1
  while (true) {
    const batch = await ghFetch(`/repos/${repo}/commits?since=${sinceISO}&per_page=100&page=${page}`, token)
    out.push(...batch)
    if (batch.length < 100) break
    page++
    if (page > 30) break // safety cap (~3000 commits/repo/month)
  }
  return out
}

export async function getGitHubStats(token: string): Promise<GitHubStats> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(now.getTime() - 7 * 86400000)
  // 30 buckets ending today (local): today - 29 days .. today
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
  const windowStartISO = windowStart.toISOString()

  const allRepos = await getAccessibleRepos(token)

  // Repos pushed within the window, most-recent first, capped so heavy weeks
  // (e.g. noelle) are never dropped for stale personal repos.
  const recentRepos = allRepos
    .filter(r => r.pushedAt && new Date(r.pushedAt) >= windowStart)
    .sort((a, b) => new Date(b.pushedAt!).getTime() - new Date(a.pushedAt!).getTime())
    .slice(0, 50)
    .map(r => r.name)

  let commitsToday = 0
  let commitsWeek = 0
  let prsOpen = 0
  let prsMerged = 0
  let latestCommit: string | null = null
  let latestCommitAt = 0
  const repoWeekCounts: Record<string, number> = {}
  const dayBuckets: Record<string, number> = {}

  for (const repo of recentRepos) {
    try {
      const commits = await fetchCommitsSince(repo, windowStartISO, token)
      let weekCount = 0
      for (const c of commits) {
        const iso = c.commit?.committer?.date || c.commit?.author?.date
        if (!iso) continue
        const when = new Date(iso)
        const day = localDate(when)
        dayBuckets[day] = (dayBuckets[day] || 0) + 1
        if (when >= todayStart) commitsToday++
        if (when >= weekStart) { commitsWeek++; weekCount++ }
        if (when.getTime() > latestCommitAt) {
          latestCommitAt = when.getTime()
          latestCommit = c.commit?.message?.split('\n')[0] || latestCommit
        }
      }
      if (weekCount > 0) repoWeekCounts[repo.split('/').pop() || repo] = weekCount

      const openPrs = await ghFetch(`/repos/${repo}/pulls?state=open&per_page=100`, token)
      prsOpen += openPrs.length
      const closedPrs = await ghFetch(`/repos/${repo}/pulls?state=closed&since=${weekStart.toISOString()}&per_page=100`, token)
      prsMerged += closedPrs.filter((pr: any) => pr.merged_at).length
    } catch (e) {
      console.error(`GitHub error for ${repo}:`, e)
    }
  }

  // Top 5 repos by weekly commits
  const topRepos = Object.entries(repoWeekCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, commits]) => ({ name, commits }))

  // Dense 30-day timeline (zero-filled) so the chart is real, not app-open sampled
  const commitTimeline: { date: string; commits: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const key = localDate(d)
    commitTimeline.push({ date: key, commits: dayBuckets[key] || 0 })
  }

  // Streak — consecutive days with commits, from the same real timeline
  let streak = 0
  for (let i = commitTimeline.length - 1; i >= 0; i--) {
    if (commitTimeline[i].commits > 0) streak++
    else break
  }

  return { commitsToday, commitsWeek, prsOpen, prsMerged, latestCommit, repoCount: allRepos.length, streak, topRepos, commitTimeline }
}
