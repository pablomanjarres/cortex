export type CloudProvider = 'aws' | 'gcp'
export type CloudProviderFilter = CloudProvider | 'all'

export interface CloudCostLineItem {
  date: string
  provider: CloudProvider
  account: string
  project: string
  service: string
  amountUsd: number
}

export interface CloudCostSourceStatus {
  configured: boolean
  ok: boolean
  sourceId: string | null
  fetchedAt: string | null
  attemptedAt: string | null
  error: string | null
}

export interface CloudCostCache {
  version: 1
  periodStart: string
  periodEnd: string
  fetchedAt: string
  items: CloudCostLineItem[]
  sources: Record<CloudProvider, CloudCostSourceStatus>
}

export interface CloudCostSettings {
  awsProfile: string
  gcpBillingTable: string
  gcpQueryProject: string
  monthlyBudgetUsd: number
}
