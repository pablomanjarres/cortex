import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  type GetCostAndUsageCommandInput,
} from '@aws-sdk/client-cost-explorer'
import { fromIni } from '@aws-sdk/credential-providers'
import type { CloudCostSettings, ProviderCosts } from '../cloud-cost-types.js'
import {
  normalizeAwsPage,
  type AwsCostPass,
  type AwsCostRow,
  type AwsCostExplorerPage,
} from '../cloud-cost-normalizers.js'

export interface CostExplorerLike {
  send(command: GetCostAndUsageCommand): Promise<AwsCostExplorerPage>
}

const PASS_CONFIG: Record<AwsCostPass, { metric: string; filter?: GetCostAndUsageCommandInput['Filter'] }> = {
  usage: {
    metric: 'AmortizedCost',
    filter: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Usage', 'DiscountedUsage', 'SavingsPlanCoveredUsage'] } },
  },
  credit: {
    metric: 'UnblendedCost',
    filter: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Credit'] } },
  },
  net: { metric: 'NetAmortizedCost', filter: undefined },
}

async function collectPass(
  client: CostExplorerLike,
  start: string,
  end: string,
  pass: AwsCostPass,
): Promise<AwsCostRow[]> {
  const rows: AwsCostRow[] = []
  let nextPageToken: string | undefined
  do {
    const { metric, filter } = PASS_CONFIG[pass]
    const page = await client.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: 'DAILY',
      Metrics: [metric],
      Filter: filter,
      GroupBy: [
        { Type: 'DIMENSION', Key: 'SERVICE' },
        { Type: 'DIMENSION', Key: 'LINKED_ACCOUNT' },
      ],
      NextPageToken: nextPageToken,
    }))
    const normalized = normalizeAwsPage(page, pass)
    rows.push(...normalized.rows)
    nextPageToken = normalized.nextPageToken
  } while (nextPageToken)
  return rows
}

function accountTotals(rows: ReadonlyArray<AwsCostRow>): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.date}: ${row.account}`
    totals.set(key, (totals.get(key) ?? 0) + row.amountUsd)
  }
  return totals
}

export async function collectAwsCosts(
  client: CostExplorerLike,
  start: string,
  end: string,
): Promise<ProviderCosts> {
  const usageRows = await collectPass(client, start, end, 'usage')
  const creditRows = await collectPass(client, start, end, 'credit')
  const netRows = await collectPass(client, start, end, 'net')
  const usageItems: ProviderCosts['usageItems'] = usageRows
    .filter((row) => row.amountUsd > 0)
    .map((row) => ({
      date: row.date,
      provider: 'aws',
      account: row.account,
      project: row.account,
      service: row.service,
      resource: null,
      amountUsd: row.amountUsd,
    }))
  const accountAdjustments: ProviderCosts['accountAdjustments'] = creditRows.map((row) => ({
    date: row.date,
    provider: 'aws',
    account: row.account,
    kind: 'credit',
    amountUsd: row.amountUsd,
  }))
  const netTotals = accountTotals(netRows)
  const usageTotals = accountTotals(usageItems)
  const creditTotals = accountTotals(creditRows)
  const accountDays = new Set([...netTotals.keys(), ...usageTotals.keys(), ...creditTotals.keys()])
  for (const key of accountDays) {
    const residual = (netTotals.get(key) ?? 0) - (usageTotals.get(key) ?? 0) - (creditTotals.get(key) ?? 0)
    if (Math.abs(residual) < 0.000001) continue
    const [date, account] = key.split(': ')
    accountAdjustments.push({ date, provider: 'aws', account, kind: 'other', amountUsd: residual })
  }
  return { usageItems, accountAdjustments }
}

export async function fetchAwsCosts(
  settings: CloudCostSettings,
  start: string,
  end: string,
): Promise<ProviderCosts> {
  const client = new CostExplorerClient({
    region: 'us-east-1',
    credentials: fromIni({ profile: settings.awsProfile }),
  })
  return collectAwsCosts(client, start, end)
}
