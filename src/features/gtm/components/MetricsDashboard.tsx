import { Flag, MessageCircle, MessageSquare, Phone } from 'lucide-react'
import type { GtmDailyLog, GtmHistoryEntry, GtmPhaseState } from '@/types/gtm'
import { PHASES } from '../phases'

interface MetricsDashboardProps {
  log: GtmDailyLog
  history: GtmHistoryEntry[]
  phaseState: GtmPhaseState
}

export function MetricsDashboard({ log, history, phaseState }: MetricsDashboardProps) {
  const totalDms = history.reduce((sum, h) => sum + h.dmsSent, 0)
  const totalResponses = history.reduce((sum, h) => sum + h.dmResponses, 0)
  const totalDemos = history.reduce((sum, h) => sum + h.demoCalls, 0)

  // Response rate
  const responseRate = totalDms > 0 ? (totalResponses / totalDms) * 100 : null
  const responseRateDisplay = responseRate !== null ? responseRate.toFixed(1) + '%' : '\u2014'
  const responseRateColor =
    responseRate === null
      ? 'text-muted-foreground'
      : responseRate >= 10
        ? 'text-green-400'
        : responseRate >= 5
          ? 'text-yellow-400'
          : 'text-red-400'

  // Current phase info
  const phase = PHASES.find((p) => p.id === phaseState.currentPhase) ?? PHASES[0]
  const phaseStartDate = phaseState.phaseStartDates[phaseState.currentPhase]
  let phaseSub = phase.duration
  if (phaseStartDate) {
    const start = new Date(phaseStartDate)
    const now = new Date()
    const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    phaseSub = `Day ${days + 1} \u2022 ${phase.duration}`
  }

  const cards = [
    {
      icon: MessageSquare,
      color: 'text-blue-400',
      label: 'Total DMs',
      value: totalDms.toLocaleString(),
      sub: `+${log.dmsSent} today`,
    },
    {
      icon: MessageCircle,
      color: responseRateColor,
      label: 'Response Rate',
      value: responseRateDisplay,
      sub: 'Healthy >10%',
    },
    {
      icon: Phone,
      color: 'text-purple-400',
      label: 'Demo Calls',
      value: totalDemos.toLocaleString(),
      sub: `+${log.demoCalls} today`,
    },
    {
      icon: Flag,
      color: 'text-purple-400',
      label: 'Current Phase',
      value: `Phase ${phase.id} \u2014 ${phase.shortName}`,
      sub: phaseSub,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((kpi) => (
        <div key={kpi.label} className="liquid-glass flex flex-col gap-1 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
          </div>
          <p className="text-xl font-bold tabular-nums md:text-2xl">{kpi.value}</p>
          <p className="text-[10px] text-muted-foreground">{kpi.sub}</p>
        </div>
      ))}
    </div>
  )
}
