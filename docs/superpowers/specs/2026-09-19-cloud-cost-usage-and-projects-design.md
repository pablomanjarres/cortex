# Cloud Spend usage and project breakdown

## Problem

Cloud Spend currently stores one net amount for each AWS or GCP row. Promotional credits can cancel all resource charges, so the page shows zero while the infrastructure is generating cost. A negative GCP project net can also make the service pie chart overlap and project percentages exceed 100%. The September 19 live export showed these failures in the installed app.

## Goal

Show what cloud resources cost before promotional credits. Keep credits and the estimated net account cost visible, but do not use either as the denominator for usage graphs, budgets, or project shares. Add a monthly view for each GCP project and a resource breakdown when the Detailed Billing Export identifies the resource.

The numbers are USD equivalents. They are provider cost estimates, not proof of payment or a final invoice.

## Data contract

Replace the version 1 net-only cache with version 2 data:

- `usageItems`: dated, nonnegative usage charges with provider, billing account, GCP project or AWS linked account, service, and optional resource identity.
- `accountAdjustments`: dated credit and other adjustment totals with provider and billing account. These entries have signed USD amounts. They never enter a pie chart or project-share calculation.
- Source status, source identity, period bounds, and fetch timestamps remain in the cache.

The displayed account estimate is the sum of usage and account adjustments. A GCP project total is the sum of its usage items. Credits are not assigned to a GCP project merely because an export row happens to carry that project ID. This matters when one promotion covers several projects and the export leaves one project with a positive net and another with a negative net.

Version 1 cache rows cannot be converted back to usage. The app discards those rows and refreshes each configured provider. If refresh fails, it reports usage as unavailable instead of relabeling old net values as usage. Later version 2 refresh failures retain only the matching source's last successful data.

## AWS ingestion

Use the existing local AWS profile and `GetCostAndUsage` with daily granularity, pagination, `SERVICE` and `LINKED_ACCOUNT` groups. Fetch usage with `AmortizedCost` restricted to the AWS `Usage`, `DiscountedUsage`, and `SavingsPlanCoveredUsage` record types. Amortized cost reflects the effective cost of covered usage. Fetch `Credit` separately as an account adjustment. Fetch the full net amortized cost for reconciliation; any difference not explained by usage and credits becomes an `other` account adjustment, not a negative usage row. Keep those requests atomic per source: one failed pass fails that provider's refresh.

The UI calls this amount "Usage before credits," not list price. It may include reservation and Savings Plan pricing. The six-hour refresh cadence remains, and the setup document will state the extra Cost Explorer requests.

## GCP ingestion

Use the configured Billing Export table and Application Default Credentials. In the BigQuery query, retain `SUM(cost)` and `SUM(credits)` separately, convert each by `currency_conversion_rate`, and exclude nonregular `cost_type` rows from usage. Credit and nonregular rows contribute to account adjustments. Keep date parameters and table validation.

Read the table schema to detect whether `resource` is available. For a Detailed export, group usage by `project.id`, service, `resource.global_name` or `resource.name`, and billing labels where present. A Standard export continues to provide project and service totals, with resource detail marked unavailable. A missing resource identity in a Detailed export appears as "Unallocated resource" within its GCP project. Do not infer cost from logs or resource names when the billing row lacks an identity.

The current `nella-sync.billing_export` Detailed export already identifies `construcredit`, `noelle-agents`, and `nella-sync` through `project.id`. No new export, resource label, IAM grant, or cloud resource is required for the first working project graph.

## Dashboard

- The month-to-date, prior-month, projection, 13-month total, budget, monthly bars, cumulative daily burn, service mix, project ranking, and spend drivers use usage charges.
- A compact account summary shows credits and estimated net cost separately. For a selected GCP project, the project usage remains primary; account-wide credits remain labeled at account scope.
- A GCP project selector exposes 13 monthly usage totals for the chosen project. Selecting `construcredit` shows its own monthly series and current-month service and resource breakdowns.
- The project ranking uses nonnegative usage totals. Its denominator is the sum of the visible projects' usage, so shares stay between zero and 100%.
- The service pie receives only positive usage slices. Zero-value services are omitted. No chart receives a signed credit or adjustment.
- Provider and project filters state their scope, and empty or failed-source states distinguish no usage from unavailable data.

Shared charges with no resource identity stay in the project's "Unallocated resource" row. The project total still includes them because the billing export identifies the project. This feature does not split a single resource's cost across apps that share that resource.

## Tests and acceptance

- Start with failing tests for an AWS account where usage and credits cancel, a GCP billing account whose project net values have opposite signs, and a Detailed export row without a resource identity.
- Cover pagination, USD conversion, adjustment reconciliation, cache migration, per-project monthly series, nonnegative chart data, share bounds, and the Standard export fallback.
- Run cloud tests, existing tests, changed-file lint, renderer and Electron builds, and the existing package checks.
- Package and install `/Applications/Cortex.app`, verify its signature and build hash, then refresh against the configured live sources. Confirm the installed UI shows nonzero AWS usage and the GCP `construcredit` monthly amount while credits remain separate.
- Reread the source statuses and project totals from the app cache. Preserve unrelated Cortex stores and report any live mismatch.

## Delivery

Use granular commits on the existing isolated worktree. Push a PR without pushing or merging `main`. The current PR has already received its one official review pass, so review handling for subsequent commits must respect that limit.

## Out of scope

Changing cloud resources or billing export settings, allocating one shared resource across apps by log estimates, asserting that estimated net cost equals an invoice payment, and adding alerts.
