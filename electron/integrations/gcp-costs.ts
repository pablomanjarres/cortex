import { BigQuery } from '@google-cloud/bigquery'
import type { CloudCostSettings, ProviderCosts } from '../cloud-cost-types.js'
import { normalizeGcpRows, validateBillingTable } from '../cloud-cost-normalizers.js'

interface BigQueryLike {
  query(options: {
    query: string
    params: Record<string, string>
    useLegacySql: false
  }): Promise<[unknown[]]>
}

export function buildGcpBillingQuery(rawTable: string, hasResource = false): string {
  const table = validateBillingTable(rawTable)
  const resource = hasResource
    ? "COALESCE(NULLIF(resource.global_name, ''), NULLIF(resource.name, ''))"
    : 'NULL'
  return `
    SELECT
      CAST(DATE(usage_start_time) AS STRING) AS usageDate,
      billing_account_id AS account,
      project.id AS project,
      service.description AS service,
      ${resource} AS resource,
      SUM(IF(cost_type = 'regular', cost, 0)) AS usageCost,
      SUM(IF(cost_type != 'regular', cost, 0)) AS otherCost,
      SUM((SELECT COALESCE(SUM(credit.amount), 0) FROM UNNEST(credits) AS credit)) AS credits,
      currency_conversion_rate AS currencyConversionRate
    FROM \`${table}\`
    WHERE DATE(usage_start_time) >= DATE(@startDate)
      AND DATE(usage_start_time) < DATE(@endDate)
    GROUP BY 1, 2, 3, 4, 5, 9
    ORDER BY usageDate ASC
  `
}

function buildGcpSchemaQuery(table: string): string {
  const [project, dataset] = table.split('.')
  return `
    SELECT column_name
    FROM \`${project}.${dataset}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name = @tableName AND column_name = 'resource'
    LIMIT 1
  `
}

export async function collectGcpCosts(
  client: BigQueryLike,
  table: string,
  start: string,
  end: string,
): Promise<ProviderCosts> {
  const validatedTable = validateBillingTable(table)
  const tableName = validatedTable.split('.')[2]
  const [schemaRows] = await client.query({
    query: buildGcpSchemaQuery(validatedTable),
    params: { tableName },
    useLegacySql: false,
  })
  const hasResource = schemaRows.some((row) => Boolean(
    row && typeof row === 'object' && 'column_name' in row && row.column_name === 'resource',
  ))
  const [rows] = await client.query({
    query: buildGcpBillingQuery(validatedTable, hasResource),
    params: { startDate: start, endDate: end },
    useLegacySql: false,
  })
  return normalizeGcpRows(rows)
}

export async function fetchGcpCosts(
  settings: CloudCostSettings,
  start: string,
  end: string,
): Promise<ProviderCosts> {
  const client = new BigQuery({ projectId: settings.gcpQueryProject.trim() || undefined })
  const queryClient: BigQueryLike = {
    query: async (options) => {
      const [rows] = await client.query(options)
      return [rows]
    },
  }
  return collectGcpCosts(queryClient, settings.gcpBillingTable, start, end)
}
