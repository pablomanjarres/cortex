const GITHUB_API = 'https://api.github.com'
const REPOS = ['pablomanjarresneg/nella', 'pablomanjarresneg/nella-website', 'pablomanjarresneg/life-audit-dashboard']

interface GitHubStats {
  commitsToday: number
  commitsWeek: number
  prsOpen: number
  prsMerged: number
  latestCommit: string | null
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

export async function getGitHubStats(token: string): Promise<GitHubStats> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString()

  let commitsToday = 0
  let commitsWeek = 0
  let prsOpen = 0
  let prsMerged = 0
  let latestCommit: string | null = null

  for (const repo of REPOS) {
    try {
      // Commits today
      const todayCommits = await ghFetch(`/repos/${repo}/commits?since=${todayStart}&per_page=100`, token)
      commitsToday += todayCommits.length

      // Commits this week
      const weekCommits = await ghFetch(`/repos/${repo}/commits?since=${weekStart}&per_page=100`, token)
      commitsWeek += weekCommits.length

      if (todayCommits.length > 0 && !latestCommit) {
        latestCommit = todayCommits[0].commit?.message?.split('\n')[0] || null
      }

      // Open PRs
      const openPrs = await ghFetch(`/repos/${repo}/pulls?state=open&per_page=100`, token)
      prsOpen += openPrs.length

      // Merged PRs this week
      const closedPrs = await ghFetch(`/repos/${repo}/pulls?state=closed&since=${weekStart}&per_page=100`, token)
      prsMerged += closedPrs.filter((pr: any) => pr.merged_at).length
    } catch (e) {
      console.error(`GitHub error for ${repo}:`, e)
    }
  }

  return { commitsToday, commitsWeek, prsOpen, prsMerged, latestCommit }
}
