# Cloud Cost Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic read-only AWS and GCP cost tracking with a complete Cloud Spend dashboard in Cortex.

**Architecture:** Provider adapters normalize cloud billing rows into one encrypted cache. A six-hour Electron refresher is the only cache writer; the renderer reads that cache and derives chart series with pure helpers.

**Tech Stack:** TypeScript 5.9, Electron 41, React 19, Recharts 3, AWS SDK v3 Cost Explorer, Google Cloud BigQuery, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-18-cloud-cost-tracking-design.md`

## Global Constraints

- Credentials remain in the AWS shared config and Google Application Default Credentials stores.
- Provider API access is read-only and automatic refresh runs at most every six hours.
- All combined totals are USD equivalents and cover the current plus previous 12 calendar months.
- Existing Cortex design tokens and shared primitives are mandatory; raw palette colors are forbidden.
- `/Applications/Cortex.app` is the production target and existing stores must survive installation unchanged.

---

### Task 1: Lock the cloud-cost contract and analytics with tests

**Files:**
- Create: `scripts/cloud-cost-analytics.test.mts`
- Create: `electron/cloud-cost-types.ts`
- Create: `src/features/cloud-costs/analytics.ts`

**Interfaces:**
- Produces: `CloudCostLineItem`, `CloudCostCache`, `CloudCostSettings`, `monthlySeries`, `dailyCumulativeSeries`, `cloudCostSummary`, `topServices`, `projectRanking`, `spendDrivers`.

- [ ] Write tests with fixed UTC dates for 13-month grouping, provider filters, projection, zero-prior-month delta, top-five service folding, project ordering, and month-over-month drivers.
- [ ] Run `node --test scripts/cloud-cost-analytics.test.mts`; verify it fails because `analytics.ts` does not exist.
- [ ] Add the shared contract and pure analytics implementation. Use `roundMoney` only on returned display series, never during accumulation.
- [ ] Run `node --test scripts/cloud-cost-analytics.test.mts`; expect all analytics tests to pass.
- [ ] Commit the test alone as `test(cloud-costs): define dashboard analytics`, then commit the contract and helper as `feat(cloud-costs): add normalized cost analytics`.

### Task 2: Normalize and fetch AWS and GCP costs

**Files:**
- Create: `scripts/cloud-cost-normalizers.test.mts`
- Create: `electron/cloud-cost-normalizers.ts`
- Create: `electron/integrations/aws-costs.ts`
- Create: `electron/integrations/gcp-costs.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `CloudCostLineItem`, `CloudCostSettings`.
- Produces: `normalizeAwsPage`, `normalizeGcpRows`, `validateBillingTable`, `fetchAwsCosts(settings, start, end)`, `fetchGcpCosts(settings, start, end)`.

- [ ] Write fixtures covering AWS grouped rows, pagination token preservation, GCP credits and currency conversion, blank projects, and rejected BigQuery identifiers.
- [ ] Run `node --test scripts/cloud-cost-normalizers.test.mts`; verify the missing normalizer module fails.
- [ ] Implement normalizers. AWS maps `SERVICE` and `LINKED_ACCOUNT`; GCP computes `(cost + credits) / currencyConversionRate` and assigns `Unassigned` for blank projects.
- [ ] Run the normalizer tests and verify they pass.
- [ ] Install `@aws-sdk/client-cost-explorer`, `@aws-sdk/credential-providers`, and `@google-cloud/bigquery` as runtime dependencies.
- [ ] Implement paginated provider adapters with injectable clients, date-only boundaries, `NetUnblendedCost`, parameterized BigQuery dates, and validated table interpolation.
- [ ] Run normalizer tests and `npm run electron:compile`.
- [ ] Commit tests as `test(cloud-costs): cover provider normalization`, dependencies as `build: add cloud billing clients`, and provider code as `feat(cloud-costs): fetch AWS and GCP spend`.

### Task 3: Add the resilient background refresher

**Files:**
- Create: `scripts/cloud-cost-refresher.test.mts`
- Create: `electron/cloud-cost-refresher.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`

**Interfaces:**
- Consumes: provider fetchers and `cortex-cloud-cost-settings`.
- Produces: `startCloudCostRefresher`, `refreshCloudCosts`, `cloudCostStatus`, IPC methods `cloudCosts.refresh()` and `cloudCosts.status()`.

- [ ] Write tests for date boundaries and `mergeProviderResults`: successful slices replace old rows, failed slices stay stale, disabled slices are removed, and safe errors contain no credentials.
- [ ] Run `node --test scripts/cloud-cost-refresher.test.mts`; verify the missing refresher helpers fail.
- [ ] Implement pure date/merge helpers and the refresher with one in-flight cycle, six-hour jitter, wake refresh, startup seeding, per-source isolation, and atomic encrypted cache writes.
- [ ] Register IPC in the refresher and expose the typed preload bridge.
- [ ] Start the refresher from `electron/main.ts` using existing read/write/broadcast dependencies.
- [ ] Run all cloud-cost tests plus `npm run electron:compile`.
- [ ] Commit tests as `test(cloud-costs): cover resilient refresh merging`, refresher as `feat(cloud-costs): refresh billing data in background`, and bridge wiring as `feat(cloud-costs): expose refresh status to renderer`.

### Task 4: Build the Cloud Spend dashboard

**Files:**
- Create: `src/features/cloud-costs/CloudCostsPage.tsx`
- Create: `src/features/cloud-costs/CloudCostCharts.tsx`
- Create: `src/features/cloud-costs/CloudCostSettings.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/routes.ts`

**Interfaces:**
- Consumes: cache/settings contracts, analytics helpers, `window.electronAPI.cloudCosts`.
- Produces: lazy `/cloud-costs` route and responsive dashboard.

- [ ] Add the route under Founder with the `Cloud` icon and lazy page loading.
- [ ] Build a settings card for AWS profile, GCP table, GCP query project, and monthly USD budget using `useStore` and existing Input/Button components.
- [ ] Build reusable monthly, daily, service, project, and driver components with `chart-theme`, `WidgetCard`, `StatTile`, `TrendBadge`, `Chip`, `Skeleton`, and `EmptyState`.
- [ ] Compose filters, KPIs, health state, stale warnings, manual refresh, setup state, and no-data state in `CloudCostsPage`.
- [ ] Run targeted ESLint on the five files, `npm run build`, and the analytics tests.
- [ ] Commit route changes as `feat(cloud-costs): add Cloud Spend navigation`, settings as `feat(cloud-costs): configure billing sources`, and charts/page as `feat(cloud-costs): add spend dashboard`.

### Task 5: Document setup and verify the complete app

**Files:**
- Create: `docs/cloud-cost-setup.md`
- Modify: `README.md`
- Modify: `tasks/todo.md` (ignored local execution record)

**Interfaces:**
- Produces: exact AWS IAM, AWS profile, GCP export, ADC, and Cortex configuration instructions.

- [ ] Document the one-action AWS IAM policy, named profile setup, GCP Standard/Detailed export requirement, ADC command, exact table format, query-project behavior, cadence, and data-retention limits.
- [ ] Add one short README bullet and link to the setup guide.
- [ ] Run every existing and new Node test, targeted lint, web build, Electron compile, and MCP build.
- [ ] Commit docs as `docs: add cloud billing setup`.
- [ ] Build and install `/Applications/Cortex.app`; preserve hashes for existing finance, habit, opportunity, and settings stores before and after.
- [ ] Verify code signature, packaged/source `app.asar` equality, port 3456, route rendering, setup state, store readability, and refresh error handling without configured credentials.
- [ ] Push `codex/cloud-costs`, open a PR against `main`, run one code review, fix valid findings, rerun verification, push fixes, and submit one GitHub review object with `gh pr review --comment`.
