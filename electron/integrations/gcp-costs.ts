import { BigQuery } from '@google-cloud/bigquery'
import type { CloudCostLineItem, CloudCostSettings } from '../cloud-cost-types.js'
import { normalizeGcpRows, validateBillingTable } from '../cloud-cost-normalizers.js'

interface BigQueryLike {
  query(options: {
    query: string
    params: { startDate: string; endDate: string }
    useLegacySql: false
  }): Promise<[unknown[]]>
}

export function buildGcpBillingQuery(rawTable: string): string {
  const table = validateBillingTable(rawTable)
  return `
    SELECT
      CAST(DATE(usage_start_time) AS STRING) AS usageDate,
      billing_account_id AS account,
      project.id AS project,
      service.description AS service,
      SUM(cost) AS cost,
      SUM((SELECT COALESCE(SUM(credit.amount), 0) FROM UNNEST(credits) AS credit)) AS credits,
      currency_conversion_rate AS currencyConversionRate
    FROM \`${table}\`
    WHERE DATE(usage_start_time) >= DATE(@startDate)
      AND DATE(usage_start_time) < DATE(@endDate)
    GROUP BY usageDate, account, project, service, currencyConversionRate
    ORDER BY usageDate ASC
  `
}

export async function collectGcpCosts(
  client: BigQueryLike,
  table: string,
  start: string,
  end: string,
): Promise<CloudCostLineItem[]> {
  const [rows] = await client.query({
    query: buildGcpBillingQuery(table),
    params: { startDate: start, endDate: end },
    useLegacySql: false,
  })
  return normalizeGcpRows(rows)
}

export async function fetchGcpCosts(
  settings: CloudCostSettings,
  start: string,
  end: string,
): Promise<CloudCostLineItem[]> {
  const client = new BigQuery({ projectId: settings.gcpQueryProject.trim() || undefined })
  return collectGcpCosts(client, settings.gcpBillingTable, start, end)
}
