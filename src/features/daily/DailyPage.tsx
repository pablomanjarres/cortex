import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Play,
  Pause,
  RotateCcw,
  Plus,
  Clock,
  Zap,
  Calendar,
  RefreshCw,
} from 'lucide-react'

// ─── NON-NEGOTIABLES ──────────────────────────────────────────

interface Target {
  id: string
  text: string
  deadline: string
  done: boolean
}

const emptyTargets: Target[] = [
  { id: '1', text: '', deadline: '18:00', done: false },
  { id: '2', text: '', deadline: '18:00', done: false },
  { id: '3', text: '', deadline: '18:00', done: false },
]

// ─── SHIPPING LOG ─────────────────────────────────────────────

interface ShipEntry {
  id: string
  text: string
  time: string
}

// ─── HABITS (read from same store as HabitsPage) ─────────────

interface HabitDef {
  id: string
  name: string
  emoji: string
}

const defaultHabits: HabitDef[] = [
  { id: '1', name: 'Workout', emoji: '💪' },
  { id: '2', name: 'Read 30min', emoji: '📖' },
  { id: '3', name: 'Meditate', emoji: '🧘' },
  { id: '4', name: 'Journal', emoji: '✍️' },
  { id: '5', name: 'No social media before noon', emoji: '📵' },
  { id: '6', name: 'Drink 2L water', emoji: '💧' },
  { id: '7', name: 'Sleep by 11pm', emoji: '🌙' },
]

// ─── PAGE ─────────────────────────────────────────────────────

export function DailyPage() {
  const navigate = useNavigate()

  // Date key for daily persistence
  const today = new Date().toISOString().slice(0, 10)

  // Non-negotiables (persisted by day)
  const [targets, updateTargets] = useStore<Target[]>(`cortex-daily-targets-${today}`, emptyTargets)
  const setTargets = (v: Target[] | ((p: Target[]) => Target[])) => updateTargets(typeof v === 'function' ? v : () => v)
  const shippedCount = targets.filter((t) => t.done).length
  const allShipped = shippedCount === 3 && targets.every((t) => t.text.trim())

  // Sprint timer (ephemeral — no need to persist timer ticks)
  const [timerTask, setTimerTask] = useState('')
  const [timerDuration, setTimerDuration] = useState(25)
  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [sessions, setSessions] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerPresets = [15, 25, 45, 60, 90]
  const [showCustomTime, setShowCustomTime] = useState(false)
  const [customTimeInput, setCustomTimeInput] = useState('')

  // Habits (from shared store — same as HabitsPage)
  const [habits] = useStore<HabitDef[]>('cortex-habits', defaultHabits)

  // Shipping log (persisted by day)
  const [shipLog, updateShipLog] = useStore<ShipEntry[]>(`cortex-daily-shiplog-${today}`, [])
  const setShipLog = (v: ShipEntry[] | ((p: ShipEntry[]) => ShipEntry[])) => updateShipLog(typeof v === 'function' ? v : () => v)
  const [shipInput, setShipInput] = useState('')

  // Habits (persisted by day)
  const [habitsDone, updateHabitsDone] = useStore<Record<string, boolean>>(`cortex-daily-habits-${today}`, {})
  const setHabitsDone = (v: Record<string, boolean> | ((p: Record<string, boolean>) => Record<string, boolean>)) => updateHabitsDone(typeof v === 'function' ? v : () => v)
  const habitsCompleted = Object.values(habitsDone).filter(Boolean).length

  // Score
  const [score, setScore] = useState(0)

  // Calendar — auto-refresh every 5 min + on window focus
  const [calendarEvents, setCalendarEvents] = useState<{ title: string; startTime: string; endTime: string; calendar: string; isAllDay: boolean }[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const isElectron = !!window.electronAPI

  const fetchCalendar = async () => {
    if (!window.electronAPI?.calendar) return
    setCalendarLoading(true)
    try { setCalendarEvents(await window.electronAPI.calendar.getTodayEvents()) }
    catch { /* silent */ }
    finally { setCalendarLoading(false) }
  }

  useEffect(() => {
    fetchCalendar()
    const interval = setInterval(fetchCalendar, 5 * 60 * 1000) // every 5 min
    const onFocus = () => fetchCalendar()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [])

  // ─── Timer logic ─────────────────────────────────────────
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => setTimeLeft((p) => p - 1), 1000)
    } else if (timeLeft === 0 && isRunning) {
      setSessions((p) => p + 1)
      setTimeLeft(timerDuration * 60)
      setIsRunning(false)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isRunning, timeLeft, timerDuration])

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60
  const resetTimer = () => { setIsRunning(false); setTimeLeft(timerDuration * 60) }
  const setDuration = (m: number) => { setTimerDuration(m); if (!isRunning) setTimeLeft(m * 60) }

  // ─── Tray navigation ────────────────────────────────────
  useEffect(() => {
    if (window.electronAPI?.onNavigate) {
      window.electronAPI.onNavigate((route) => navigate(route))
    }
  }, [navigate])

  // ─── Tray stats ──────────────────────────────────────────
  useEffect(() => {
    if (window.electronAPI?.tray) {
      window.electronAPI.tray.updateStats({
        tasks: `${shippedCount}/3 shipped`,
        habits: `${habitsCompleted}/${habits.length}`,
        score: score > 0 ? `${score}/10` : '—',
      })
    }
  })

  // ─── Helpers ─────────────────────────────────────────────
  const updateTarget = (id: string, field: Partial<Target>) => {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, ...field } : t)))
  }

  const addShipEntry = () => {
    if (!shipInput.trim()) return
    const now = new Date()
    setShipLog((prev) => [{
      id: Date.now().toString(),
      text: shipInput.trim(),
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    }, ...prev])
    setShipInput('')
  }

  // ─── Check deadline urgency ──────────────────────────────
  const isOverdue = (deadline: string) => {
    if (!deadline) return false
    const [h, m] = deadline.split(':').map(Number)
    const now = new Date()
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)
  }

  return (
    <PageShell>
      {/* ─── HEADER ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-between"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight mt-0.5">
            {shippedCount === 3 && targets.every(t => t.text.trim())
              ? 'Everything shipped.'
              : shippedCount > 0
                ? `${3 - shippedCount} left to ship.`
                : 'Nothing shipped yet.'}
          </h2>
        </div>
        <div className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-2xl font-bold tabular-nums transition-colors ${
          allShipped ? 'text-green-400' : 'text-red-400'
        }`}>
          {shippedCount}/3
        </div>
      </motion.div>

      {/* ─── TIER 1: NON-NEGOTIABLES ────────────────────── */}
      <WidgetCard
        title="NON-NEGOTIABLES"
        description="Ship these or the day is wasted"
        variant={allShipped ? 'success' : 'urgent'}
        delay={0.05}
      >
        <div className="flex flex-col gap-2">
          {targets.map((target, i) => (
            <div
              key={target.id}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
                target.done
                  ? 'bg-green-500/5'
                  : isOverdue(target.deadline) && target.text.trim()
                    ? 'bg-red-500/5'
                    : 'bg-secondary/50'
              }`}
            >
              <Checkbox
                checked={target.done}
                onCheckedChange={() => updateTarget(target.id, { done: !target.done })}
              />
              <span className="text-sm font-semibold text-muted-foreground w-5">{i + 1}.</span>
              <Input
                value={target.text}
                onChange={(e) => updateTarget(target.id, { text: e.target.value })}
                placeholder={
                  i === 0 ? 'Ship feature X...'
                    : i === 1 ? 'Talk to 3 users...'
                      : 'Post demo on X + LinkedIn...'
                }
                className={`h-8 flex-1 border-0 bg-transparent text-sm font-medium placeholder:text-muted-foreground/40 focus-visible:ring-0 ${
                  target.done ? 'line-through text-muted-foreground' : ''
                }`}
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <Clock className={`h-3 w-3 ${isOverdue(target.deadline) && !target.done ? 'text-red-400' : 'text-muted-foreground/50'}`} />
                <input
                  type="time"
                  value={target.deadline}
                  onChange={(e) => updateTarget(target.id, { deadline: e.target.value })}
                  className="bg-transparent text-xs tabular-nums text-muted-foreground w-16 focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>
      </WidgetCard>

      {/* ─── TIER 2: EXECUTION ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Sprint Timer */}
        <WidgetCard title="SPRINT" description={`${sessions} sessions · ${Math.floor(sessions * timerDuration / 60)}h ${(sessions * timerDuration) % 60}m deep work`} delay={0.1}>
          <div className="flex flex-col gap-4">
            <Input
              value={timerTask}
              onChange={(e) => setTimerTask(e.target.value)}
              placeholder="What are you working on?"
              className="h-9 bg-input text-sm font-medium"
            />
            <div className="flex items-center justify-between">
              <span className={`font-mono text-4xl md:text-5xl font-bold tabular-nums tracking-tight ${isRunning ? 'text-foreground' : 'text-muted-foreground'}`}>
                {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsRunning(!isRunning)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-80"
                >
                  {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </button>
                <button
                  onClick={resetTimer}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:text-foreground"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Duration presets */}
            <div className="flex gap-1.5">
              {timerPresets.map((m) => (
                <button
                  key={m}
                  onClick={() => { setDuration(m); setShowCustomTime(false) }}
                  disabled={isRunning}
                  className={`flex-1 rounded-md py-1 text-xs font-medium transition-all ${
                    timerDuration === m && !showCustomTime
                      ? 'bg-foreground text-background'
                      : 'bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30'
                  }`}
                >
                  {m}m
                </button>
              ))}
              <button
                onClick={() => setShowCustomTime(!showCustomTime)}
                disabled={isRunning}
                className={`flex-1 rounded-md py-1 text-xs font-medium transition-all ${
                  showCustomTime || !timerPresets.includes(timerDuration)
                    ? 'bg-foreground text-background'
                    : 'bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30'
                }`}
              >
                {!timerPresets.includes(timerDuration) ? `${timerDuration}m` : '...'}
              </button>
            </div>
            {showCustomTime && (
              <div className="flex gap-1.5 items-center">
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={customTimeInput}
                  onChange={(e) => setCustomTimeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseInt(customTimeInput)
                      if (val > 0 && val <= 240) { setDuration(val); setShowCustomTime(false) }
                    }
                  }}
                  placeholder="minutes"
                  className="flex-1 h-7 rounded-md bg-input px-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
                <button
                  onClick={() => {
                    const val = parseInt(customTimeInput)
                    if (val > 0 && val <= 240) { setDuration(val); setShowCustomTime(false) }
                  }}
                  className="h-7 rounded-md bg-foreground px-3 text-xs font-medium text-background"
                >
                  Set
                </button>
              </div>
            )}
          </div>
        </WidgetCard>

        {/* Shipping Log */}
        <WidgetCard title="SHIPPED TODAY" description={`${shipLog.length} outputs`} delay={0.15} compact>
            <div className="flex gap-2 mb-3">
              <Input
                value={shipInput}
                onChange={(e) => setShipInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addShipEntry()}
                placeholder="What did you just ship?"
                className="h-8 bg-input text-sm flex-1"
              />
              <button
                onClick={addShipEntry}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background transition-opacity hover:opacity-80"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {shipLog.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground/50 py-3">
                Nothing shipped yet. Get to work.
              </p>
            ) : (
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                {shipLog.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2.5 px-1 py-1">
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0 mt-0.5">{entry.time}</span>
                    <Zap className="h-3 w-3 text-green-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-foreground">{entry.text}</span>
                  </div>
                ))}
              </div>
            )}
          </WidgetCard>
      </div>

      {/* ─── TIER 3: SUPPORT ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Schedule */}
        <WidgetCard
          title="SCHEDULE"
          description={isElectron ? `${calendarEvents.length} events` : '—'}
          delay={0.25}
          compact
        >
          {isElectron && calendarEvents.length > 0 ? (
            <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
              {calendarEvents.map((evt, i) => (
                <div key={`${evt.title}-${i}`} className="flex items-center gap-2 py-1">
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground w-10 shrink-0">
                    {evt.isAllDay ? 'ALL' : evt.startTime}
                  </span>
                  <span className="text-xs truncate">{evt.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {isElectron ? 'No events today' : 'Desktop app only'}
              </p>
              {isElectron && (
                <button onClick={fetchCalendar} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                  <RefreshCw className={`h-3 w-3 ${calendarLoading ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          )}
        </WidgetCard>

        {/* Compact Habits */}
        <WidgetCard title="HABITS" description={`${habitsCompleted}/${habits.length}`} delay={0.3} compact>
          <div className="flex items-center justify-between">
            {habits.map((h) => (
              <button
                key={h.id}
                onClick={() => setHabitsDone((p) => ({ ...p, [h.id]: !p[h.id] }))}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-base transition-all ${
                  habitsDone[h.id]
                    ? 'bg-foreground/10 ring-1 ring-foreground/20'
                    : 'bg-secondary/80 opacity-40 hover:opacity-70'
                }`}
              >
                {h.emoji}
              </button>
            ))}
          </div>
        </WidgetCard>

        {/* Daily Score — minimal */}
        <WidgetCard title="DAY SCORE" description="End of day" delay={0.35} compact>
          <div className="flex items-center gap-1">
            {Array.from({ length: 10 }, (_, i) => (
              <button
                key={i}
                onClick={() => setScore(i + 1)}
                className={`flex h-7 flex-1 items-center justify-center rounded text-[10px] font-bold transition-all ${
                  i + 1 <= score
                    ? i + 1 >= 8
                      ? 'bg-yellow-400/20 text-yellow-400'
                      : 'bg-foreground text-background'
                    : 'bg-secondary text-muted-foreground/50 hover:text-muted-foreground'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </WidgetCard>
      </div>

      {/* ─── EVENING REFLECTION ─────────────────────────── */}
      <WidgetCard title="EVENING REFLECTION" delay={0.4} compact>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              What went well?
            </label>
            <textarea
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder="Today's wins..."
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              What could improve?
            </label>
            <textarea
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder="Areas for growth..."
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Key learnings
            </label>
            <textarea
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder="What did you learn today..."
            />
          </div>
        </div>
      </WidgetCard>
    </PageShell>
  )
}
