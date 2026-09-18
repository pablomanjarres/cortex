import {
  CostExplorerClient,
  GetCostAndUsageCommand,
} from '@aws-sdk/client-cost-explorer'
import { fromIni } from '@aws-sdk/credential-providers'
import type { CloudCostLineItem, CloudCostSettings } from '../cloud-cost-types.js'
import {
  normalizeAwsPage,
  type AwsCostExplorerPage,
} from '../cloud-cost-normalizers.js'

export interface CostExplorerLike {
  send(command: GetCostAndUsageCommand): Promise<AwsCostExplorerPage>
}

export async function collectAwsCosts(
  client: CostExplorerLike,
  start: string,
  end: string,
): Promise<CloudCostLineItem[]> {
  const items: CloudCostLineItem[] = []
  let nextPageToken: string | undefined
  do {
    const page = await client.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: 'DAILY',
      Metrics: ['NetUnblendedCost'],
      GroupBy: [
        { Type: 'DIMENSION', Key: 'SERVICE' },
        { Type: 'DIMENSION', Key: 'LINKED_ACCOUNT' },
      ],
      NextPageToken: nextPageToken,
    }))
    const normalized = normalizeAwsPage(page)
    items.push(...normalized.items)
    nextPageToken = normalized.nextPageToken
  } while (nextPageToken)
  return items
}

export async function fetchAwsCosts(
  settings: CloudCostSettings,
  start: string,
  end: string,
): Promise<CloudCostLineItem[]> {
  const client = new CostExplorerClient({
    region: 'us-east-1',
    credentials: fromIni({ profile: settings.awsProfile }),
  })
  return collectAwsCosts(client, start, end)
}
