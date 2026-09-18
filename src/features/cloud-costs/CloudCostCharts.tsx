import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CloudProviderFilter } from '../../../electron/cloud-cost-types.ts'
import type { DailyCostPoint, MonthlyCostPoint } from './analytics.ts'
import type { RankedCost } from './breakdowns.ts'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  CHART_FONT_MONO,
  ThemedTooltip,
  axisProps,
  chartColors,
  cssVar,
  gridProps,
} from '@/lib/chart-theme'
import { fmtCompactUsd, fmtDay, fmtMonth, fmtUsd } from './format'

const legendStyle = {
  fontFamily: CHART_FONT_MONO,
  fontSize: 10,
  color: 'var(--muted-foreground)',
}

interface MonthlySpendChartProps {
  data: MonthlyCostPoint[]
  provider: CloudProviderFilter
}

export function MonthlySpendChart({ data, provider }: MonthlySpendChartProps) {
  const [accent, green] = chartColors()
  return (
    <WidgetCard title="Monthly spend" description="Provider totals · trailing 13 months" className="lg:col-span-2" delay={0.1}>
      <div className="h-72" role="img" aria-label="Monthly AWS and GCP spend in US dollars">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps()} />
            <XAxis dataKey="month" tickFormatter={fmtMonth} {...axisProps()} />
            <YAxis width={52} tickFormatter={(value) => fmtCompactUsd(Number(value))} {...axisProps()} />
            <Tooltip content={<ThemedTooltip formatter={(value) => fmtUsd(Number(value))} />} cursor={{ fill: cssVar('--secondary'), fillOpacity: 0.35 }} />
            <Legend wrapperStyle={legendStyle} />
            {provider !== 'gcp' ? <Bar dataKey="aws" name="AWS" stackId="cost" fill={accent} radius={[3, 3, 0, 0]} /> : null}
            {provider !== 'aws' ? <Bar dataKey="gcp" name="GCP" stackId="cost" fill={green} radius={[3, 3, 0, 0]} /> : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </WidgetCard>
  )
}

interface DailyBurnChartProps {
  data: DailyCostPoint[]
  provider: CloudProviderFilter
}

export function DailyBurnChart({ data, provider }: DailyBurnChartProps) {
  const [accent, green, amber] = chartColors()
  return (
    <WidgetCard title="Current-month burn" description="Cumulative cost by usage date" className="lg:col-span-2" delay={0.15}>
      {data.length > 0 ? (
        <div className="h-64" role="img" aria-label="Cumulative cloud spend for the current month">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps()} />
              <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={28} {...axisProps()} />
              <YAxis width={52} tickFormatter={(value) => fmtCompactUsd(Number(value))} {...axisProps()} />
              <Tooltip content={<ThemedTooltip formatter={(value) => fmtUsd(Number(value))} labelFormatter={(value) => fmtDay(String(value))} />} cursor={{ stroke: cssVar('--border') }} />
              <Area type="monotone" dataKey="total" name="Total" stroke={accent} fill={accent} fillOpacity={0.12} strokeWidth={2} dot={false} />
              {provider === 'all' ? <Line type="monotone" dataKey="aws" name="AWS" stroke={green} strokeWidth={1.5} dot={false} /> : null}
              {provider === 'all' ? <Line type="monotone" dataKey="gcp" name="GCP" stroke={amber} strokeWidth={1.5} dot={false} /> : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No current-month usage yet." hint="The chart appears after a provider reports cost." />
      )}
    </WidgetCard>
  )
}

export function ServiceMixChart({ data }: { data: RankedCost[] }) {
  const colors = chartColors()
  return (
    <WidgetCard title="Service mix" description="Current month" delay={0.2}>
      {data.length > 0 ? (
        <div className="h-64" role="img" aria-label="Current month cloud spend by service">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="amount" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
                {data.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip content={<ThemedTooltip formatter={(value) => fmtUsd(Number(value))} />} />
              <Legend wrapperStyle={legendStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No service costs yet." />
      )}
    </WidgetCard>
  )
}
