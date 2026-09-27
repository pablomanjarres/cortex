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
import type { DailyCostPoint, MonthlyCostPoint, MonthlyProjectPoint } from './analytics.ts'
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
    <WidgetCard title="Monthly spend" description="Usage before credits · trailing 13 months" className="lg:col-span-2" delay={0.1}>
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

export function MonthlyProjectChart({ data, project }: { data: MonthlyProjectPoint[]; project: string }) {
  const [accent] = chartColors()
  return (
    <WidgetCard title={`${project} monthly usage`} description="GCP project · trailing 13 months" className="lg:col-span-2">
      <div className="h-64" role="img" aria-label={`Monthly GCP usage for ${project} in US dollars`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps()} />
            <XAxis dataKey="month" tickFormatter={fmtMonth} {...axisProps()} />
            <YAxis width={52} tickFormatter={(value) => fmtCompactUsd(Number(value))} {...axisProps()} />
            <Tooltip content={<ThemedTooltip formatter={(value) => fmtUsd(Number(value))} />} />
            <Bar dataKey="total" name="Usage" fill={accent} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </WidgetCard>
  )
}

export function DailyBurnChart({ data, provider }: DailyBurnChartProps) {
  const [accent, green, amber] = chartColors()
  return (
    <WidgetCard title="Current-month burn" description="Cumulative usage before credits" className="lg:col-span-2" delay={0.15}>
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

export function ServiceMixChart({ data, title = 'Service mix' }: { data: RankedCost[]; title?: string }) {
  const colors = chartColors()
  return (
    <WidgetCard title={title} description="Current-month usage before credits" delay={0.2}>
      {data.length > 0 ? (
        <div role="img" aria-label="Current month cloud usage by service">
          <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="amount" nameKey="name" innerRadius={40} outerRadius={64} paddingAngle={2}>
                {data.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip content={<ThemedTooltip formatter={(value) => fmtUsd(Number(value))} />} />
            </PieChart>
          </ResponsiveContainer>
          </div>
          <div className="mt-2 grid gap-1.5">
            {data.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2 text-2xs">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: colors[index % colors.length] }} />
                <span className="min-w-0 flex-1 truncate text-foreground-faint" title={entry.name}>{entry.name}</span>
                <span className="font-mono tabular-nums text-foreground">{fmtUsd(entry.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState message="No service costs yet." />
      )}
    </WidgetCard>
  )
}
