export interface GitHubStats {
  commitsToday: number
  commitsWeek: number
  prsOpen: number
  prsMerged: number
  latestCommit: string | null
  repoCount: number
  streak: number
  topRepos: { name: string; commits: number }[]
  /** Real per-day commit counts for the last 30 days, across active repos. */
  commitTimeline?: { date: string; commits: number }[]
}

export interface LemonStats {
  mrr: number
  totalCustomers: number
  newThisMonth: number
  churnedThisMonth: number
  revenueThisMonth: number
}

export interface VercelStats {
  deploymentsToday: number
  deploymentsWeek: number
  latestDeployment: { state: string; url: string; createdAt: string } | null
  pageviews: number | null
  visitors: number | null
}

export interface SupabaseStats {
  totalUsers: number
  signupsToday: number
  signupsWeek: number
}
