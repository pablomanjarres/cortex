# Cloud Cost Tracking Design

## Goal

Add automatic, read-only AWS and GCP cost tracking to Cortex. The installed macOS app must show current spend, historical totals, trends, service and project drivers, budget progress, source health, and a manual refresh without sending billing data outside the machine.

## Product shape

- Add a dedicated `/cloud-costs` route named **Cloud Spend** in the Founder navigation group.
- Show all money as USD equivalents so AWS and GCP can be combined honestly.
- Keep provider filters for All, AWS, and GCP.
- Cover the current month plus the previous 12 calendar months.
- Refresh on app startup when stale, every six hours with jitter, after wake when stale, and when the user presses Refresh.
- Preserve the last successful cache when either provider fails.

## Data sources

### AWS

Cortex uses the AWS SDK credential chain and a named local profile. The user enters the profile name, normally `default`; no AWS secret is copied into Cortex. The adapter calls Cost Explorer in `us-east-1` with `GetCostAndUsage`, daily granularity, `NetUnblendedCost`, and `SERVICE` plus `LINKED_ACCOUNT` groupings.

Required read-only IAM action:

```json
{
  "Effect": "Allow",
  "Action": "ce:GetCostAndUsage",
  "Resource": "*"
}
```

### GCP

Cortex uses Google Application Default Credentials and queries a configured Standard or Detailed Cloud Billing export table in BigQuery. The user enters the fully qualified table ID and, optionally, the query/billing project. No service-account JSON is stored in Cortex.

The query groups by usage date, service, and project. Net cost is `cost + credits`; `currency_conversion_rate` converts billing-account currency to USD. The table identifier is validated before it is interpolated into SQL.

GCP history is limited to data present in the billing export. The UI explains this when the source has no rows.

## Contract and persistence

`electron/cloud-cost-types.ts` is the shared type-only contract.

```ts
type CloudProvider = 'aws' | 'gcp'

interface CloudCostLineItem {
  date: string
  provider: CloudProvider
  account: string
  project: string
  service: string
  amountUsd: number
}

interface CloudCostCache {
  version: 1
  periodStart: string
  periodEnd: string
  fetchedAt: string
  items: CloudCostLineItem[]
  sources: Record<CloudProvider, CloudCostSourceStatus>
}
```

The cache lives at `cortex-cloud-costs`. It is encrypted by the existing Cortex data path and can be rebuilt from the providers, so background refreshes use the direct encrypted cache writer without backup churn.

Configuration lives at `cortex-cloud-cost-settings` through the normal versioned store:

```ts
interface CloudCostSettings {
  awsProfile: string
  gcpBillingTable: string
  gcpQueryProject: string
  monthlyBudgetUsd: number
}
```

A non-empty AWS profile enables AWS. A non-empty GCP table enables GCP. A zero budget disables budget percentage and over-budget messaging.

## Runtime architecture

Provider adapters only fetch and normalize data:

- `electron/integrations/aws-costs.ts` owns AWS SDK requests and pagination.
- `electron/integrations/gcp-costs.ts` owns BigQuery validation and queries.
- `electron/cloud-cost-normalizers.ts` converts provider responses into the shared line-item contract.

`electron/cloud-cost-refresher.ts` is the single writer for the cache. It:

1. Reads the latest settings.
2. Fetches enabled providers in parallel.
3. Replaces successful provider slices while retaining stale slices for failed providers.
4. Records per-source configuration, freshness, success, and a safe error message.
5. Writes and broadcasts one atomic cache update.
6. Exposes refresh and status through Electron IPC.

The renderer never calls cloud APIs. `CloudCostsPage` reads the cache and settings through `useStore`, calls the manual refresh IPC, and derives all chart series with pure analytics helpers.

## Dashboard

The page follows Cortex's Editorial Instrument Panel design system and uses only shared primitives and chart tokens.

Top row:

- Month to date
- Prior month
- Month-over-month change
- Projected month end
- Budget used when a budget exists

Charts and breakdowns:

- Stacked monthly bar chart: AWS and GCP for 13 months
- Daily cumulative area chart: current month burn by provider
- Service donut: current month top services, remaining services grouped as Other
- Project/account ranking: current month amount and share
- Spend drivers: largest absolute month-over-month service changes

Controls and states:

- All/AWS/GCP provider filter
- Refresh button with a non-spinner pending state
- Freshness and source-health chips
- Inline configuration card for profile, BigQuery table, query project, and monthly budget
- Skeleton loading, a setup empty state when nothing is configured, a no-data state when configured sources return no rows, and stale-data warnings when refresh fails

Charts remain usable on narrow screens by reducing tick density and allowing breakdown lists to stack below them.

## Analytics rules

- Months use UTC `YYYY-MM` keys because provider rows are date-only billing facts.
- Totals round only for display; calculations keep provider precision.
- Projection is current month spend divided by elapsed UTC days, multiplied by days in month.
- Month-over-month is `null` when the prior month is zero, avoiding a false infinite percentage.
- Lifetime total means the total inside the 13-month retained window and is labeled **13-month total**.
- Top-services output is deterministic: descending cost, then name; everything after the top five becomes Other.
- Failed providers keep their last successful rows but receive `ok: false`, so the UI can label values stale instead of dropping them.

## Security and cost controls

- Provider access is read-only.
- AWS and GCP credentials stay in their standard local credential stores.
- Billing table input accepts only `project.dataset.table` characters; arbitrary SQL is rejected.
- BigQuery uses date partition filters and parameterized dates.
- The automatic cadence is six hours to avoid noisy Cost Explorer and BigQuery requests.
- Logs contain provider names and safe errors, never credential material or raw billing rows.

## Testing and verification

- Node tests cover date windows, aggregation, projection, top-service grouping, AWS normalization/pagination, GCP normalization, invalid table IDs, and stale-slice merging.
- Provider adapters use injected clients in tests; no live cloud request is required in CI.
- Run the existing 34 tests, the new cloud-cost tests, targeted lint for every changed TypeScript/TSX file, `npm run build`, `npm run electron:compile`, and `cd mcp-server && npm run build`.
- Package and install `/Applications/Cortex.app`, verify its signature and `app.asar` hash, confirm port 3456, open `/cloud-costs`, and reread the cache/settings keys to prove existing data remains intact.

## Out of scope

- Mutating budgets or resources in AWS/GCP
- Currency exchange feeds beyond GCP's exported conversion rate
- Resource-level optimization recommendations
- Email or Pushover alerts
- Importing CSV billing exports
