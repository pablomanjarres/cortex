import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import type { GtmHistoryEntry } from '@/types/gtm'

// ── Helpers ──────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 11 },
}

// ── Component ────────────────────────────────────────────────────────────────

export function GtmCharts({ history }: { history: GtmHistoryEntry[] }) {
  const last14 = history.slice(-14)

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Outreach — dual bar chart */}
      <WidgetCard title="OUTREACH (14D)" description="DMs sent vs responses" delay={0.25}>
        <div className="h-[140px] sm:h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last14}>
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fontSize: 10, fill: '#888' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: '#888' }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="dmsSent" name="DMs Sent" fill="#60a5fa" radius={[3, 3, 0, 0]} />
              <Bar dataKey="dmResponses" name="Responses" fill="#34d399" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </WidgetCard>

      {/* X Followers — area chart with blue gradient */}
      <WidgetCard title="X FOLLOWERS" description="Follower growth" delay={0.35}>
        <div className="h-[140px] sm:h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={last14}>
              <defs>
                <linearGradient id="gtmFollowersGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fontSize: 10, fill: '#888' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#888' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip {...TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey="xFollowers"
                name="Followers"
                stroke="#60a5fa"
                strokeWidth={2}
                fill="url(#gtmFollowersGradient)"
                dot={{ r: 2, fill: '#60a5fa' }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </WidgetCard>
    </div>
  )
}
