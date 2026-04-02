import { useState, useEffect, useMemo } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { useStore, readStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import { useDailyHabits } from '@/lib/use-daily-habits'
import {
  ChevronLeft,
  ChevronRight,
  Zap,
  Clock,
  Target,
  GitCommit,
  Rocket,
  Users,
  DollarSign,
  Flame,
  MessageSquare,
  MessageCircle,
  Megaphone,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// --- Types ------------------------------------------------

interface SprintSession {
  id: string
  task: string
  duration: number
  startedAt: string
  completedAt: string
}

interface ShipEntry {
  id: string
  text: string
  time: string
}

interface DailyReflection {
  score: number
  wentWell: string
  improve: string
  learnings: string
}

interface HabitDef {
  id: string
  name: string
  emoji: string
}

interface HistoryEntry {
  date: string
  commits: number
  users: number
  deploys: number
  mrr: number
  prsOpen: number
  prsMerged: number
}

interface GtmDailyLog {
  date: string
  dmsSent: number
  dmResponses: number
  demoCalls: number
  xReplies: number
  xFollowers: number
  redditComments: number
  linkedinMessages: number
  channelOfSignup: string
  notes: string
}

interface WeeklyAudit {
  weekId: string
  weekStart: string
  weekEnd: string
  sprintStats: { totalSessions: number; totalDeepWork: number; avgPerDay: number; bestDay: { date: string; sessions: number } }
  habitStats: { consistency: number; perHabit: { id: string; name: string; completed: number; total: number }[] }
  founderStats: { commits: number; users: number; mrr: number; deploys: number }
  shipped: string[]
  avgDayScore: number
  reflectionHighlights: string[]
  generatedAt: string
}

// --- Helpers ----------------------------------------------

const TOOLTIP_STYLE = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 11 },
}

function getWeekDates(isoDate: string): string[] {
  const d = new Date(isoDate + 'T00:00:00')
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7))
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const wd = new Date(monday)
    wd.setDate(monday.getDate() + i)
    dates.push(wd.toISOString().slice(0, 10))
  }
  return dates
}

function getISOWeek(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatWeekLabel(startDate: string): string {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${mins}m`
}

const weekDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// --- Component --------------------------------------------

export function StatsPage() {
  const [view, setView] = useState<'day' | 'week'>('day')
  const [selectedDate, setSelectedDate] = useState(localDate())

  // Shared stores
  const [habits] = useStore<HabitDef[]>('cortex-habits', [])
  const [founderHistory] = useStore<HistoryEntry[]>('cortex-founder-history', [])

  // Habits — single source of truth via shared hook (reactive, stays in sync)
  const { completedCount: habitsCompletedToday, isCompleted: isHabitDone, habitHistory } = useDailyHabits(selectedDate)

  // --- GTM Data -------------------------------------------
  const [dayGtm, setDayGtm] = useState<GtmDailyLog | null>(null)
  const [todayGtm] = useStore<GtmDailyLog | null>(`cortex-gtm-log-${localDate()}`, null)

  // --- Day View Data --------------------------------------
  const [daySessions, setDaySessions] = useState<SprintSession[]>([])
  const [dayShips, setDayShips] = useState<ShipEntry[]>([])
  const [dayReflection, setDayReflection] = useState<DailyReflection>({ score: 0, wentWell: '', improve: '', learnings: '' })

  // Use useStore for today's data (reactive), readStore for past dates
  const todayStr = useMemo(() => localDate(), [])
  const isToday = selectedDate === todayStr
  const [todaySessions] = useStore<SprintSession[]>(`cortex-daily-sessions-${todayStr}`, [])
  const [todayShips] = useStore<ShipEntry[]>(`cortex-daily-shiplog-${todayStr}`, [])
  const [todayReflection] = useStore<DailyReflection>(`cortex-daily-reflection-${todayStr}`, { score: 0, wentWell: '', improve: '', learnings: '' })

  useEffect(() => {
    if (view !== 'day') return
    if (isToday) {
      setDaySessions(todaySessions)
      setDayShips(todayShips)
      setDayReflection(todayReflection)
      setDayGtm(todayGtm)
      return
    }
    Promise.all([
      readStore<SprintSession[]>(`cortex-daily-sessions-${selectedDate}`, []),
      readStore<ShipEntry[]>(`cortex-daily-shiplog-${selectedDate}`, []),
      readStore<DailyReflection>(`cortex-daily-reflection-${selectedDate}`, { score: 0, wentWell: '', improve: '', learnings: '' }),
      readStore<GtmDailyLog | null>(`cortex-gtm-log-${selectedDate}`, null),
    ]).then(([sessions, ships, reflection, gtm]) => {
      setDaySessions(sessions)
      setDayShips(ships)
      setDayReflection(reflection)
      setDayGtm(gtm)
    })
  }, [selectedDate, view, isToday, todaySessions, todayShips, todayReflection, todayGtm])

  const mergedHabitsCount = habitsCompletedToday

  const dayFounder = useMemo(() => founderHistory.find(h => h.date === selectedDate), [founderHistory, selectedDate])

  // --- Week View Data -------------------------------------
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const weekId = useMemo(() => getISOWeek(weekDates[0]), [weekDates])

  const [weekSessions, setWeekSessions] = useState<{ date: string; sessions: number; minutes: number }[]>([])
  const [weekShipCount, setWeekShipCount] = useState(0)
  const [weekReflections, setWeekReflections] = useState<DailyReflection[]>([])
  const [weekGtm, setWeekGtm] = useState<GtmDailyLog[]>([])
  const [weeklyAudit] = useStore<WeeklyAudit | null>(`cortex-weekly-audit-${weekId}`, null)

  useEffect(() => {
    if (view !== 'week') return
    Promise.all([
      ...weekDates.map(d => readStore<SprintSession[]>(`cortex-daily-sessions-${d}`, [])),
      ...weekDates.map(d => readStore<ShipEntry[]>(`cortex-daily-shiplog-${d}`, [])),
      ...weekDates.map(d => readStore<DailyReflection>(`cortex-daily-reflection-${d}`, { score: 0, wentWell: '', improve: '', learnings: '' })),
      ...weekDates.map(d => readStore<GtmDailyLog | null>(`cortex-gtm-log-${d}`, null)),
    ]).then((results) => {
      const sessions = results.slice(0, 7) as SprintSession[][]
      const ships = results.slice(7, 14) as ShipEntry[][]
      const reflections = results.slice(14, 21) as DailyReflection[]
      const gtmLogs = results.slice(21, 28) as (GtmDailyLog | null)[]

      setWeekSessions(sessions.map((s, i) => ({
        date: weekDates[i],
        sessions: s.length,
        minutes: s.reduce((sum, x) => sum + x.duration, 0),
      })))
      setWeekShipCount(ships.reduce((s, arr) => s + arr.length, 0))
      setWeekReflections(reflections)
      setWeekGtm(gtmLogs.filter((g): g is GtmDailyLog => g !== null && (g.dmsSent > 0 || g.xReplies > 0 || g.demoCalls > 0)))
    })
  }, [weekDates, view])

  const weekFounder = useMemo(
    () => founderHistory.filter(h => weekDates.includes(h.date)),
    [founderHistory, weekDates]
  )

  // Week habit data — respects per-habit goals
  const weekHabitData = useMemo(() => {
    return habits.map(h => {
      const goal = (h as any).weeklyGoal ?? 7
      const completed = weekDates.filter(d => habitHistory[d]?.[h.id]).length
      return { name: h.emoji + ' ' + h.name, completed, goal }
    })
  }, [habits, habitHistory, weekDates])

  const weekHabitConsistency = useMemo(() => {
    if (habits.length === 0) return 0
    const avgPct = weekHabitData.reduce((s, h) => s + Math.min(h.completed / h.goal, 1), 0) / habits.length
    return Math.round(avgPct * 100)
  }, [weekHabitData, habits])

  // --- Navigation -----------------------------------------
  const navigate = (dir: number) => {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + (view === 'day' ? dir : dir * 7))
    setSelectedDate(localDate(d))
  }

  const goToToday = () => setSelectedDate(localDate())

  return (
    <PageShell>
      {/* Header with view toggle and date navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('day')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              view === 'day' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setView('week')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              view === 'week' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            Week
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={goToToday} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            Today
          </button>
          <button onClick={() => navigate(1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Date label */}
      <p className="text-sm font-medium text-muted-foreground">
        {view === 'day'
          ? formatDate(selectedDate)
          : `Week of ${formatWeekLabel(weekDates[0])}`}
      </p>

      {/* --- DAY VIEW -------------------------------------- */}
      {view === 'day' && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Sessions', value: daySessions.length.toString(), icon: Clock },
              { label: 'Deep work', value: formatMinutes(daySessions.reduce((s, x) => s + x.duration, 0)), icon: Zap },
              { label: 'Habits', value: `${mergedHabitsCount}/${habits.length}`, icon: Target },
              { label: 'Day score', value: dayReflection.score > 0 ? `${dayReflection.score}/10` : '\u2014', icon: Flame },
            ].map((stat) => (
              <div key={stat.label} className="liquid-glass flex flex-col gap-1 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                </div>
                <p className="text-xl font-bold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Sprint sessions */}
            <WidgetCard title="SPRINT SESSIONS" description={`${daySessions.length} sessions`} delay={0.05}>
              {daySessions.length > 0 ? (
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                  {daySessions.map((s) => (
                    <div key={s.id} className="flex items-center gap-2.5 rounded-lg bg-secondary/30 px-3 py-2">
                      <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
                        {new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-xs truncate flex-1">{s.task}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{s.duration}m</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/50 py-4 text-center">No sprint sessions</p>
              )}
            </WidgetCard>

            {/* Shipped */}
            <WidgetCard title="SHIPPED" description={`${dayShips.length} items`} delay={0.1}>
              {dayShips.length > 0 ? (
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                  {dayShips.map((s) => (
                    <div key={s.id} className="flex items-start gap-2.5 px-1 py-1">
                      <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0 mt-0.5">{s.time}</span>
                      <Zap className="h-3 w-3 text-green-400 shrink-0 mt-0.5" />
                      <span className="text-xs">{s.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/50 py-4 text-center">Nothing shipped</p>
              )}
            </WidgetCard>
          </div>

          {/* Habits for the day */}
          <WidgetCard title="HABITS" description={`${mergedHabitsCount}/${habits.length}`} delay={0.15} compact>
            <div className="flex flex-wrap gap-2">
              {habits.map((h) => (
                <div
                  key={h.id}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${
                    isHabitDone(h.id)
                      ? 'bg-foreground/10 text-foreground'
                      : 'bg-secondary/50 text-muted-foreground/40'
                  }`}
                >
                  <span>{h.emoji}</span>
                  <span>{h.name}</span>
                </div>
              ))}
            </div>
          </WidgetCard>

          {/* Reflection */}
          {(dayReflection.score > 0 || dayReflection.wentWell || dayReflection.improve || dayReflection.learnings) && (
            <WidgetCard title="REFLECTION" description={dayReflection.score > 0 ? `Score: ${dayReflection.score}/10` : ''} delay={0.2}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {dayReflection.wentWell && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">What went well</p>
                    <p className="text-xs text-foreground/80">{dayReflection.wentWell}</p>
                  </div>
                )}
                {dayReflection.improve && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">What could improve</p>
                    <p className="text-xs text-foreground/80">{dayReflection.improve}</p>
                  </div>
                )}
                {dayReflection.learnings && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Key learnings</p>
                    <p className="text-xs text-foreground/80">{dayReflection.learnings}</p>
                  </div>
                )}
              </div>
            </WidgetCard>
          )}

          {/* Founder snapshot */}
          {dayFounder && (
            <WidgetCard title="FOUNDER SNAPSHOT" delay={0.25} compact>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Commits', value: dayFounder.commits, icon: GitCommit },
                  { label: 'Deploys', value: dayFounder.deploys, icon: Rocket },
                  { label: 'Users', value: dayFounder.users, icon: Users },
                  { label: 'MRR', value: `$${dayFounder.mrr}`, icon: DollarSign },
                ].map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">{m.label}</span>
                    <span className="ml-auto text-sm font-bold tabular-nums">{m.value}</span>
                  </div>
                ))}
              </div>
            </WidgetCard>
          )}

          {/* GTM snapshot */}
          {dayGtm && (dayGtm.dmsSent > 0 || dayGtm.xReplies > 0 || dayGtm.demoCalls > 0) && (
            <WidgetCard title="GTM SNAPSHOT" delay={0.3} compact>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'DMs sent', value: dayGtm.dmsSent, icon: MessageSquare, color: 'text-blue-400' },
                  { label: 'Responses', value: dayGtm.dmResponses, icon: MessageCircle, color: 'text-green-400' },
                  { label: 'Demo calls', value: dayGtm.demoCalls, icon: Megaphone, color: 'text-purple-400' },
                  { label: 'X replies', value: dayGtm.xReplies, icon: MessageCircle, color: 'text-blue-400' },
                  { label: 'X followers', value: dayGtm.xFollowers, icon: Users, color: 'text-blue-400' },
                  { label: 'Reddit', value: dayGtm.redditComments, icon: MessageSquare, color: 'text-orange-400' },
                  { label: 'LinkedIn', value: dayGtm.linkedinMessages, icon: MessageSquare, color: 'text-blue-300' },
                ].map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <m.icon className={`h-3.5 w-3.5 ${m.color}`} />
                    <span className="text-[10px] text-muted-foreground">{m.label}</span>
                    <span className="ml-auto text-sm font-bold tabular-nums">{m.value}</span>
                  </div>
                ))}
              </div>
              {dayGtm.notes && (
                <div className="mt-3 rounded-lg bg-secondary/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Notes</p>
                  <p className="text-xs text-foreground/80">{dayGtm.notes}</p>
                </div>
              )}
            </WidgetCard>
          )}
        </>
      )}

      {/* --- WEEK VIEW ------------------------------------- */}
      {view === 'week' && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {[
              { label: 'Sessions', value: weekSessions.reduce((s, d) => s + d.sessions, 0).toString() },
              { label: 'Deep work', value: formatMinutes(weekSessions.reduce((s, d) => s + d.minutes, 0)) },
              { label: 'Shipped', value: weekShipCount.toString() },
              { label: 'Habit score', value: `${weekHabitConsistency}%` },
              { label: 'Avg day score', value: (() => { const scores = weekReflections.filter(r => r.score > 0).map(r => r.score); return scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '\u2014' })() },
            ].map((stat) => (
              <div key={stat.label} className="liquid-glass flex flex-col gap-1 rounded-xl px-4 py-3">
                <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                <p className="text-xl font-bold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Sprint trend */}
            <WidgetCard title="SPRINT SESSIONS" description="Sessions per day" delay={0.05}>
              <div className="h-[140px] sm:h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekSessions.map((d, i) => ({ day: weekDayNames[i], sessions: d.sessions, minutes: d.minutes }))}>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={25} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Bar dataKey="sessions" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </WidgetCard>

            {/* Deep work trend */}
            <WidgetCard title="DEEP WORK" description="Minutes per day" delay={0.1}>
              <div className="h-[140px] sm:h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekSessions.map((d, i) => ({ day: weekDayNames[i], minutes: d.minutes }))}>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Bar dataKey="minutes" fill="#34d399" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </WidgetCard>

            {/* Habit consistency */}
            <WidgetCard title="HABIT CONSISTENCY" description={`${weekHabitConsistency}% this week`} delay={0.15}>
              <div className="flex flex-col gap-1.5">
                {weekHabitData.map((h) => {
                  const pct = Math.min(h.completed / h.goal, 1) * 100
                  const met = h.completed >= h.goal
                  return (
                    <div key={h.name} className="flex items-center gap-2">
                      <span className="text-xs w-32 sm:w-40 truncate">{h.name}</span>
                      <div className="flex-1 h-4 rounded bg-secondary/50 overflow-hidden">
                        <div
                          className={`h-full rounded ${met ? 'bg-green-500/30' : 'bg-foreground/20'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-mono tabular-nums w-8 text-right ${met ? 'text-green-400' : 'text-muted-foreground'}`}>{h.completed}/{h.goal}</span>
                    </div>
                  )
                })}
              </div>
            </WidgetCard>

            {/* Founder weekly */}
            {weekFounder.length > 0 && (
              <WidgetCard title="FOUNDER METRICS" description="This week" delay={0.2}>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Commits', value: weekFounder.reduce((s, h) => s + h.commits, 0), icon: GitCommit },
                    { label: 'Deploys', value: weekFounder.reduce((s, h) => s + h.deploys, 0), icon: Rocket },
                    { label: 'Users (latest)', value: weekFounder[weekFounder.length - 1]?.users ?? 0, icon: Users },
                    { label: 'MRR (latest)', value: `$${weekFounder[weekFounder.length - 1]?.mrr ?? 0}`, icon: DollarSign },
                  ].map((m) => (
                    <div key={m.label} className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2.5">
                      <m.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">{m.label}</p>
                        <p className="text-lg font-bold tabular-nums">{m.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            )}

            {/* GTM weekly */}
            {weekGtm.length > 0 && (() => {
              const totalDms = weekGtm.reduce((s, g) => s + g.dmsSent, 0)
              const totalResponses = weekGtm.reduce((s, g) => s + g.dmResponses, 0)
              const responseRate = totalDms > 0 ? ((totalResponses / totalDms) * 100).toFixed(0) + '%' : '\u2014'
              return (
                <WidgetCard title="GTM METRICS" description="This week" delay={0.25}>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'DMs sent', value: totalDms, icon: MessageSquare, color: 'text-blue-400' },
                      { label: 'Response rate', value: responseRate, icon: MessageCircle, color: totalDms > 0 && totalResponses / totalDms >= 0.1 ? 'text-green-400' : 'text-red-400' },
                      { label: 'Demo calls', value: weekGtm.reduce((s, g) => s + g.demoCalls, 0), icon: Megaphone, color: 'text-purple-400' },
                      { label: 'X replies', value: weekGtm.reduce((s, g) => s + g.xReplies, 0), icon: MessageCircle, color: 'text-blue-400' },
                      { label: 'Reddit', value: weekGtm.reduce((s, g) => s + g.redditComments, 0), icon: MessageSquare, color: 'text-orange-400' },
                      { label: 'LinkedIn', value: weekGtm.reduce((s, g) => s + g.linkedinMessages, 0), icon: MessageSquare, color: 'text-blue-300' },
                    ].map((m) => (
                      <div key={m.label} className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2.5">
                        <m.icon className={`h-4 w-4 shrink-0 ${m.color}`} />
                        <div>
                          <p className="text-[10px] text-muted-foreground">{m.label}</p>
                          <p className="text-lg font-bold tabular-nums">{m.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </WidgetCard>
              )
            })()}
          </div>

          {/* Weekly Audit (if generated) */}
          {weeklyAudit && (
            <WidgetCard title="WEEKLY AUDIT" description={`Generated ${new Date(weeklyAudit.generatedAt).toLocaleDateString()}`} delay={0.3}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Sprint Summary</p>
                  <p className="text-sm">{weeklyAudit.sprintStats.totalSessions} sessions, {formatMinutes(weeklyAudit.sprintStats.totalDeepWork)} deep work</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Avg {weeklyAudit.sprintStats.avgPerDay} sessions/day</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Habits</p>
                  <p className="text-sm">{weeklyAudit.habitStats.consistency}% consistency</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Avg Day Score</p>
                  <p className="text-sm">{weeklyAudit.avgDayScore > 0 ? `${weeklyAudit.avgDayScore}/10` : 'No scores'}</p>
                </div>
                {weeklyAudit.shipped.length > 0 && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <p className="text-[10px] text-muted-foreground mb-1">Shipped ({weeklyAudit.shipped.length} items)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {weeklyAudit.shipped.slice(0, 10).map((s, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {weeklyAudit.reflectionHighlights.length > 0 && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <p className="text-[10px] text-muted-foreground mb-1">Highlights</p>
                    <div className="flex flex-col gap-1">
                      {weeklyAudit.reflectionHighlights.map((h, i) => (
                        <p key={i} className="text-xs text-foreground/70">{h}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </WidgetCard>
          )}
        </>
      )}
    </PageShell>
  )
}
