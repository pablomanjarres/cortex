export interface GitHubStats {
  commitsToday: number
  commitsWeek: number
  prsOpen: number
  prsMerged: number
  latestCommit: string | null
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
