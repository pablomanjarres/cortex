import { WidgetCard } from '@/components/widgets/WidgetCard'
import { localDate } from '@/lib/date-utils'
import { PHASES } from '../phases'
import type { GtmHistoryEntry } from '@/types/gtm'

interface WeeklyReviewProps {
  history: GtmHistoryEntry[]
  currentPhase: number
}

function getThisWeekTotals(history: GtmHistoryEntry[]): Record<string, number> {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const start = new Date(now)
  start.setDate(now.getDate() + diffToMon)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const startStr = localDate(start)
  const endStr = localDate(end)

  // String comparison — avoids UTC/local timezone mismatch
  const thisWeek = history.filter((e) => e.date >= startStr && e.date <= endStr)

  return {
    dmsSent: thisWeek.reduce((sum, e) => sum + e.dmsSent, 0),
    dmResponses: thisWeek.reduce((sum, e) => sum + e.dmResponses, 0),
    demoCalls: thisWeek.reduce((sum, e) => sum + e.demoCalls, 0),
    xReplies: thisWeek.reduce((sum, e) => sum + e.xReplies, 0),
    xFollowers: thisWeek.reduce((sum, e) => sum + e.xFollowers, 0),
    redditComments: thisWeek.reduce((sum, e) => sum + e.redditComments, 0),
    linkedinMessages: thisWeek.reduce((sum, e) => sum + e.linkedinMessages, 0),
  }
}

const LABEL_TO_KEY: Record<string, string> = {
  'DMs sent (X)': 'dmsSent',
  'DMs sent (maintenance)': 'dmsSent',
  'Thoughtful replies on X': 'xReplies',
  'LinkedIn intro requests': 'linkedinMessages',
  'LinkedIn posts': 'linkedinMessages',
  'Reddit/Discord replies': 'redditComments',
  'Demo calls booked': 'demoCalls',
  'User conversations': 'demoCalls',
  'X posts (own content)': 'xReplies',
}

function parseTarget(target: string): number {
  // Handle "X/week" patterns
  const weekMatch = target.match(/^(\d+)\/week$/)
  if (weekMatch) return parseInt(weekMatch[1], 10)

  // Handle "X-Y/week" range patterns — use midpoint
  const rangeMatch = target.match(/^(\d+)-(\d+)\/week$/)
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1], 10)
    const high = parseInt(rangeMatch[2], 10)
    return Math.round((low + high) / 2)
  }

  // Handle "X min/day" patterns — convert to weekly
  const minDayMatch = target.match(/^(\d+)\s*min\/day$/)
  if (minDayMatch) {
    const minutesPerDay = parseInt(minDayMatch[1], 10)
    return Math.round((minutesPerDay * 7) / 60)
  }

  // Handle "X posts/week" or similar
  const postsMatch = target.match(/^(\d+)(?:-(\d+))?\s*posts?\/week$/)
  if (postsMatch) {
    const low = parseInt(postsMatch[1], 10)
    const high = postsMatch[2] ? parseInt(postsMatch[2], 10) : low
    return Math.round((low + high) / 2)
  }

  return 0
}

function getProgressColor(percent: number): string {
  if (percent >= 100) return 'bg-green-500'
  if (percent >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function WeeklyReview({ history, currentPhase }: WeeklyReviewProps) {
  const phase = PHASES.find((p) => p.id === currentPhase)

  if (!phase) return null

  if (phase.weeklyTargets.length === 0) {
    return (
      <WidgetCard title="THIS WEEK" description="vs targets" compact>
        <p className="text-sm text-muted-foreground">
          No weekly targets for this phase.
        </p>
      </WidgetCard>
    )
  }

  const totals = getThisWeekTotals(history)

  return (
    <WidgetCard title="THIS WEEK" description="vs targets" compact>
      <div className="space-y-3">
        {phase.weeklyTargets.map((wt, i) => {
          const targetValue = parseTarget(wt.target)
          const key = LABEL_TO_KEY[wt.label] ?? ''
          const current = totals[key] ?? 0
          const percent = targetValue > 0 ? (current / targetValue) * 100 : 0

          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{wt.label}</span>
                <span className="tabular-nums font-medium">
                  {current}/{targetValue}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary/50">
                <div
                  className={`h-full rounded-full ${getProgressColor(percent)}`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </WidgetCard>
  )
}
