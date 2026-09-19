export type CloudProvider = 'aws' | 'gcp'
export type CloudProviderFilter = CloudProvider | 'all'

export interface CloudCostLineItem {
  date: string
  provider: CloudProvider
  account: string
  project: string
  service: string
  resource: string | null
  amountUsd: number
}

export interface CloudAccountAdjustment {
  date: string
  provider: CloudProvider
  account: string
  kind: 'credit' | 'other'
  amountUsd: number
}

export interface ProviderCosts {
  usageItems: CloudCostLineItem[]
  accountAdjustments: CloudAccountAdjustment[]
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
  version: 2
  periodStart: string
  periodEnd: string
  fetchedAt: string
  usageItems: CloudCostLineItem[]
  accountAdjustments: CloudAccountAdjustment[]
  sources: Record<CloudProvider, CloudCostSourceStatus>
}

export interface CloudCostSettings {
  awsProfile: string
  gcpBillingTable: string
  gcpQueryProject: string
  monthlyBudgetUsd: number
}
