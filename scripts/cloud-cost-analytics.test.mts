import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cloudCostSummary,
  dailyCumulativeSeries,
  monthlySeries,
} from '../src/features/cloud-costs/analytics.ts'
import { projectRanking, spendDrivers, topServices } from '../src/features/cloud-costs/breakdowns.ts'
import { utcDate } from '../src/lib/date-utils.ts'

const items = [
  { date: '2026-07-05', provider: 'aws', account: '111', project: '111', service: 'EC2', amountUsd: 200 },
  { date: '2026-08-01', provider: 'aws', account: '111', project: '111', service: 'EC2', amountUsd: 100 },
  { date: '2026-08-03', provider: 'gcp', account: 'billing', project: 'alpha', service: 'Compute', amountUsd: 50 },
  { date: '2026-09-01', provider: 'aws', account: '111', project: '111', service: 'EC2', amountUsd: 60 },
  { date: '2026-09-02', provider: 'gcp', account: 'billing', project: 'alpha', service: 'BigQuery', amountUsd: 30 },
  { date: '2026-09-10', provider: 'aws', account: '111', project: '111', service: 'S3', amountUsd: 20 },
  { date: '2026-09-17', provider: 'gcp', account: 'billing', project: 'beta', service: 'Cloud Run', amountUsd: 10 },
] as const

test('monthlySeries keeps a fixed 13-month window and separates providers', () => {
  const series = monthlySeries(items, 'all', new Date('2026-09-18T12:00:00Z'))
  assert.equal(series.length, 13)
  assert.deepEqual(series[0], { month: '2025-09', aws: 0, gcp: 0, total: 0 })
  assert.deepEqual(series.at(-2), { month: '2026-08', aws: 100, gcp: 50, total: 150 })
  assert.deepEqual(series.at(-1), { month: '2026-09', aws: 80, gcp: 40, total: 120 })
  assert.equal(monthlySeries(items, 'aws', new Date('2026-09-18T12:00:00Z')).at(-1)?.total, 80)
})

test('dailyCumulativeSeries accumulates spend by billing date and provider', () => {
  assert.deepEqual(dailyCumulativeSeries(items, 'all', '2026-09'), [
    { date: '2026-09-01', aws: 60, gcp: 0, total: 60 },
    { date: '2026-09-02', aws: 60, gcp: 30, total: 90 },
    { date: '2026-09-10', aws: 80, gcp: 30, total: 110 },
    { date: '2026-09-17', aws: 80, gcp: 40, total: 120 },
  ])
})

test('cloudCostSummary calculates honest comparison, projection, budget, and retained total', () => {
  assert.deepEqual(cloudCostSummary(items, 'all', new Date('2026-09-18T12:00:00Z'), 240), {
    currentMonth: 120,
    previousMonth: 150,
    changePct: -20,
    projectedMonth: 200,
    budgetPct: 50,
    total13Months: 470,
  })
})

test('cloudCostSummary leaves month-over-month unknown when the prior month is zero', () => {
  const septemberOnly = items.filter((item) => item.date.startsWith('2026-09'))
  assert.equal(cloudCostSummary(septemberOnly, 'all', new Date('2026-09-18T12:00:00Z'), 0).changePct, null)
  assert.equal(cloudCostSummary(septemberOnly, 'all', new Date('2026-09-18T12:00:00Z'), 0).budgetPct, null)
})

test('topServices keeps five services and folds the rest into Other', () => {
  const services = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((service, index) => ({
    date: '2026-09-01', provider: 'aws', account: '111', project: '111', service, amountUsd: 70 - index * 10,
  }))
  assert.deepEqual(topServices(services, 'all', '2026-09'), [
    { name: 'A', amount: 70, share: 25 },
    { name: 'B', amount: 60, share: 21.43 },
    { name: 'C', amount: 50, share: 17.86 },
    { name: 'D', amount: 40, share: 14.29 },
    { name: 'E', amount: 30, share: 10.71 },
    { name: 'Other', amount: 30, share: 10.71 },
  ])
})

test('topServices keeps a negative credit tail in Other', () => {
  const amounts = [100, 90, 80, 70, 60, -50]
  const services = amounts.map((amountUsd, index) => ({
    date: '2026-09-01', provider: 'aws' as const, account: '111', project: '111', service: String.fromCharCode(65 + index), amountUsd,
  }))
  assert.deepEqual(topServices(services, 'all', '2026-09'), [
    { name: 'A', amount: 100, share: 28.57 },
    { name: 'B', amount: 90, share: 25.71 },
    { name: 'C', amount: 80, share: 22.86 },
    { name: 'D', amount: 70, share: 20 },
    { name: 'E', amount: 60, share: 17.14 },
    { name: 'Other', amount: -50, share: -14.29 },
  ])
})

test('utcDate follows the provider billing day instead of the local calendar day', () => {
  assert.equal(utcDate(new Date('2026-10-01T00:30:00.000Z')), '2026-10-01')
})

test('projectRanking sorts equal totals by project name', () => {
  assert.deepEqual(projectRanking(items, 'gcp', '2026-09'), [
    { name: 'alpha', provider: 'gcp', amount: 30, share: 75 },
    { name: 'beta', provider: 'gcp', amount: 10, share: 25 },
  ])
})

test('spendDrivers reports the largest service changes first', () => {
  assert.deepEqual(spendDrivers(items, 'all', '2026-09', '2026-08'), [
    { name: 'Compute', current: 0, previous: 50, delta: -50 },
    { name: 'EC2', current: 60, previous: 100, delta: -40 },
    { name: 'BigQuery', current: 30, previous: 0, delta: 30 },
    { name: 'S3', current: 20, previous: 0, delta: 20 },
    { name: 'Cloud Run', current: 10, previous: 0, delta: 10 },
  ])
})
