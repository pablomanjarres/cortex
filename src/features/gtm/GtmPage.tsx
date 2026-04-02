import { useRef, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { useStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import type { GtmDailyLog, GtmPhaseState, GtmHistoryEntry } from '@/types/gtm'
import { EMPTY_DAILY_LOG, DEFAULT_PHASE_STATE } from '@/types/gtm'
import { MetricsDashboard } from './components/MetricsDashboard'
import { PhaseTracker } from './components/PhaseTracker'
import { DailyLogForm } from './components/DailyLogForm'
import { GtmCharts } from './components/GtmCharts'
import { TimeBlockSchedule } from './components/TimeBlockSchedule'
import { WeeklyReview } from './components/WeeklyReview'
import { HardRules } from './components/HardRules'

export function GtmPage() {
  const today = localDate()
  const [log, setLog] = useStore<GtmDailyLog>('cortex-gtm-log-' + today, EMPTY_DAILY_LOG)
  const [phaseState, setPhaseState] = useStore<GtmPhaseState>('cortex-gtm-state', DEFAULT_PHASE_STATE)
  const [history, setHistory] = useStore<GtmHistoryEntry[]>('cortex-gtm-history', [])
  const syncedRef = useRef(false)

  const upsertHistory = (date: string, data: GtmDailyLog) => {
    const entry: GtmHistoryEntry = {
      date,
      dmsSent: data.dmsSent,
      dmResponses: data.dmResponses,
      demoCalls: data.demoCalls,
      xReplies: data.xReplies,
      xFollowers: data.xFollowers,
      redditComments: data.redditComments,
      linkedinMessages: data.linkedinMessages,
    }
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.date !== date)
      const combined = [...filtered, entry]
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)
      const cutoffStr = localDate(cutoff)
      return combined.filter((h) => h.date >= cutoffStr)
    })
  }

  // Sync loaded log to history so weekly totals stay current
  useEffect(() => {
    if (syncedRef.current) return
    const hasData = log.dmsSent > 0 || log.dmResponses > 0 || log.demoCalls > 0 ||
      log.xReplies > 0 || log.xFollowers > 0 || log.redditComments > 0 || log.linkedinMessages > 0
    if (hasData) {
      syncedRef.current = true
      upsertHistory(today, log)
    }
  }, [log])

  const handleLogUpdate = (updated: GtmDailyLog) => {
    setLog(() => updated)
    upsertHistory(today, updated)
  }

  return (
    <PageShell>
      {/* Row 1: KPI cards */}
      <MetricsDashboard history={history} log={log} phaseState={phaseState} />

      {/* Row 2: Phase tracker + daily log */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PhaseTracker phaseState={phaseState} onUpdate={(s) => setPhaseState(() => s)} />
        <DailyLogForm log={log} onUpdate={handleLogUpdate} />
      </div>

      {/* Row 3: Trend charts */}
      {history.length > 1 && <GtmCharts history={history} />}

      {/* Row 4: Schedule, review, rules */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <TimeBlockSchedule currentPhase={phaseState.currentPhase} />
        <WeeklyReview history={history} currentPhase={phaseState.currentPhase} />
        <HardRules />
      </div>
    </PageShell>
  )
}
