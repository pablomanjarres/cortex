# Cloud Spend Usage and Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show cloud usage before promotional credits, correct every spend graph, and add monthly GCP project detail in the installed Cortex app.

**Architecture:** Replace the net-only cache with usage rows and account adjustments. AWS Cost Explorer and GCP Billing Export adapters return both. Pure analytics consume usage rows; summary tiles alone read adjustments.

**Tech Stack:** Electron, React, TypeScript, Recharts, AWS Cost Explorer, Google BigQuery, node:test.

**Spec:** `docs/superpowers/specs/2026-09-19-cloud-cost-usage-and-projects-design.md`

## Global Constraints

- Use USD equivalents and UTC billing dates.
- Do not assign credits to individual GCP projects.
- Preserve Standard Billing Export support and local credential storage.
- Keep six-hour source refreshes and stale-source isolation.
- Stage tests and implementation in separate commits. Never push or merge `main`.

---

### Task 1: Cache contract and migration

**Files:** `electron/cloud-cost-types.ts`, `electron/cloud-cost-refresh-state.ts`, `electron/cloud-cost-refresher.ts`, `src/features/cloud-costs/cloud-cost-store.ts`, `scripts/cloud-cost-refresher.test.mts`.

**Interfaces:** `CloudUsageItem` has `date`, `provider`, `account`, `project`, `service`, `resource: string | null`, `amountUsd`. `CloudAccountAdjustment` has `date`, `provider`, `account`, `kind`, `amountUsd`. `ProviderFetchResult` returns both arrays. `CloudCostCache.version` becomes `2`.

```ts
interface ProviderCosts {
  usageItems: CloudUsageItem[]
  accountAdjustments: CloudAccountAdjustment[]
}
```

- [ ] Add a failing test: pass a version 1 cache to `mergeProviderResults`, return no inherited net rows, and require an immediate refresh from `automaticRefreshDelayMs`.
- [ ] Run `npm run test:cloud` and confirm the new case fails.
- [ ] Replace `items` with `usageItems` and `accountAdjustments` in the cache contract and merge both per provider, by matching source ID. Reject version 1 during disk seeding and render it as empty in the store.

```ts
const compatible = raw?.version === 2 ? raw : null
const usageItems = compatible?.usageItems ?? []
const accountAdjustments = compatible?.accountAdjustments ?? []
```
- [ ] Run `npm run test:cloud` and confirm the migration and existing source-isolation cases pass.
- [ ] Commit tests, then implementation, in separate explicit file slices.

### Task 2: Provider costs before credits

**Files:** `electron/integrations/aws-costs.ts`, `electron/integrations/gcp-costs.ts`, `electron/cloud-cost-normalizers.ts`, `scripts/cloud-cost-normalizers.test.mts`.

**Interfaces:** `collectAwsCosts` and `collectGcpCosts` return `{ usageItems, accountAdjustments }`. `normalizeAwsPage(page, kind)` parses one Cost Explorer pass. `normalizeGcpRows(rows)` returns the same provider result.

- [ ] Add failing fixtures where AWS `Usage` costs 10 USD and `Credit` is negative 10 USD, and where GCP projects have positive and negative net amounts while total usage stays positive.
- [ ] Run `npm run test:cloud` and confirm those cases fail against net-only ingestion.
- [ ] Query AWS daily `AmortizedCost` for `Usage`, `DiscountedUsage`, and `SavingsPlanCoveredUsage`; query `UnblendedCost` for `Credit`; query net amortized cost for the residual adjustment. Preserve service and linked-account grouping and pagination. Validate USD units on every pass.

```ts
const usageTypes = ['Usage', 'DiscountedUsage', 'SavingsPlanCoveredUsage']
const usageFilter = { Dimensions: { Key: 'RECORD_TYPE', Values: usageTypes } }
const creditFilter = { Dimensions: { Key: 'RECORD_TYPE', Values: ['Credit'] } }
```
- [ ] Query GCP `cost` and `credits` separately in USD. Mark `cost_type=regular` as usage and other charge types as adjustments. Detect the Detailed export schema before selecting `resource.global_name` or `resource.name`; leave Standard export resource identity null.

```sql
SUM(IF(cost_type = 'regular', cost / currency_conversion_rate, 0)) AS usageUsd,
SUM((SELECT COALESCE(SUM(c.amount), 0) FROM UNNEST(credits) c) / currency_conversion_rate) AS creditUsd
```
- [ ] Run `npm run test:cloud`; commit tests and implementation separately.

### Task 3: Usage-only analytics and GCP project series

**Files:** `src/features/cloud-costs/analytics.ts`, `src/features/cloud-costs/breakdowns.ts`, `scripts/cloud-cost-analytics.test.mts`.

**Interfaces:** `monthlySeries`, `dailyCumulativeSeries`, `cloudCostSummary`, `topServices`, `projectRanking`, and `spendDrivers` take `CloudUsageItem[]`. Add `monthlyProjectSeries(items, project, now)` and `resourceRanking(items, project, month)`.

- [ ] Add failing tests for a fully credited month: usage totals remain positive, pie slices stay nonnegative, and project shares sum to 100%. Add a 13-month ConstruCredit series fixture with an unidentified resource row.
- [ ] Run `npm run test:cloud` to observe the failures.
- [ ] Make all spend analytics use `usageItems`; omit zero service slices; clamp share arithmetic to the positive usage denominator. Keep adjustments out of these functions.

```ts
const visible = usageItems.filter((item) => item.amountUsd > 0)
const share = totalUsage > 0 ? Math.min(100, Math.max(0, amount / totalUsage * 100)) : 0
```
- [ ] Run `npm run test:cloud`; commit tests and implementation separately.

### Task 4: Dashboard presentation

**Files:** `src/features/cloud-costs/CloudCostsPage.tsx`, `src/features/cloud-costs/CloudCostCharts.tsx`, `src/features/cloud-costs/CloudCostBreakdowns.tsx`, and focused components in `src/features/cloud-costs/`.

**Interfaces:** Page passes `usageItems` into spend analytics and `accountAdjustments` into a small account summary. Reuse chart and breakdown components for provider totals and selected GCP project.

- [ ] Add a rendering or pure-data regression test that supplies a credit-covered account and asserts positive monthly, burn, and service data plus a bounded project share.
- [ ] Run the test and confirm the old net-only path fails.
- [ ] Label primary tiles and charts as usage before credits. Show credits and estimated net at account scope. Add a GCP project selector, monthly project chart, and current-month service/resource breakdown, with an Unallocated resource row where identity is absent.

```tsx
<StatTile label="Month to date usage" value={fmtUsd(summary.currentMonth)} />
<AccountAdjustments credits={credits} estimatedNet={estimatedNet} />
```
- [ ] Run cloud tests, changed-file lint, `npm run build`, and `npm run electron:compile`; commit tests and UI separately.

### Task 5: Live installation and delivery

**Files:** `docs/cloud-cost-setup.md`, `tasks/todo.md` when present, and the build artifact.

- [ ] Update setup text for gross usage, account credits, Detailed export resource rows, and extra Cost Explorer requests.
- [ ] Run `npm run test:cloud`, existing tests, targeted lint, renderer build, Electron compile, MCP build, and package build. Confirm changed files pass `git diff --check`.
- [ ] Commit docs separately. Preserve user data and install the signed package at `/Applications/Cortex.app`.
- [ ] Launch from Finder so the app uses user ADC, refresh AWS and GCP, and compare displayed AWS usage and ConstruCredit GCP month total with live provider queries.
- [ ] Check signature, app hash, source health, existing store preservation, branch status, push, PR, and the single-review limit. Report exact live results and any blocker.
