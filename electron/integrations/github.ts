const GITHUB_API = 'https://api.github.com'

interface GitHubStats {
  commitsToday: number
  commitsWeek: number
  prsOpen: number
  prsMerged: number
  latestCommit: string | null
  repoCount: number
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

const ORG = 'project-labs'

async function getOrgRepos(token: string): Promise<string[]> {
  const repos: string[] = []
  let page = 1
  while (true) {
    const batch = await ghFetch(`/orgs/${ORG}/repos?sort=pushed&per_page=100&page=${page}`, token)
    if (!batch.length) break
    for (const repo of batch) {
      repos.push(repo.full_name)
    }
    if (batch.length < 100) break
    page++
  }
  return repos
}

export async function getGitHubStats(token: string): Promise<GitHubStats> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString()

  // Get all org repos
  const allRepos = await getOrgRepos(token)

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
    // Cap at 20 most recent repos to stay within rate limits
    if (recentRepos.length >= 20) break
  }

  let commitsToday = 0
  let commitsWeek = 0
  let prsOpen = 0
  let prsMerged = 0
  let latestCommit: string | null = null

  for (const repo of recentRepos) {
    try {
      const todayCommits = await ghFetch(`/repos/${repo}/commits?since=${todayStart}&per_page=100`, token)
      commitsToday += todayCommits.length

      const weekCommits = await ghFetch(`/repos/${repo}/commits?since=${weekStart}&per_page=100`, token)
      commitsWeek += weekCommits.length

      if (todayCommits.length > 0 && !latestCommit) {
        latestCommit = todayCommits[0].commit?.message?.split('\n')[0] || null
      }

      const openPrs = await ghFetch(`/repos/${repo}/pulls?state=open&per_page=100`, token)
      prsOpen += openPrs.length

      const closedPrs = await ghFetch(`/repos/${repo}/pulls?state=closed&since=${weekStart}&per_page=100`, token)
      prsMerged += closedPrs.filter((pr: any) => pr.merged_at).length
    } catch (e) {
      console.error(`GitHub error for ${repo}:`, e)
    }
  }

  return { commitsToday, commitsWeek, prsOpen, prsMerged, latestCommit, repoCount: allRepos.length }
}
