import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Plus,
  Star,
  Calendar,
  RefreshCw,
  Sun,
  Moon,
  Sunset,
  Target,
  Flame,
  Zap,
  CheckCircle2,
} from 'lucide-react'

interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

const defaultChecklist: ChecklistItem[] = [
  { id: '1', text: 'Morning workout', done: false },
  { id: '2', text: 'Review daily goals', done: false },
  { id: '3', text: 'Deep work block (2h)', done: false },
  { id: '4', text: 'Check emails & messages', done: false },
  { id: '5', text: 'Evening reflection', done: false },
]

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return { text: 'Good morning', icon: Sun, period: 'morning' }
  if (hour < 18) return { text: 'Good afternoon', icon: Sunset, period: 'afternoon' }
  return { text: 'Good evening', icon: Moon, period: 'evening' }
}

function getFormattedDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function DailyPage() {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(defaultChecklist)
  const [newItem, setNewItem] = useState('')
  const [intentions, setIntentions] = useState(['', '', ''])
  const [score, setScore] = useState(0)
  const [calendarEvents, setCalendarEvents] = useState<{ title: string; startTime: string; endTime: string; calendar: string; isAllDay: boolean }[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const isElectron = !!window.electronAPI?.calendar

  const greeting = getGreeting()
  const GreetingIcon = greeting.icon

  const fetchCalendar = async () => {
    if (!window.electronAPI?.calendar) return
    setCalendarLoading(true)
    try {
      const events = await window.electronAPI.calendar.getTodayEvents()
      setCalendarEvents(events)
    } catch (e) {
      console.error('Failed to fetch calendar:', e)
    } finally {
      setCalendarLoading(false)
    }
  }

  useEffect(() => {
    fetchCalendar()
  }, [])

  const completedCount = checklist.filter((i) => i.done).length
  const progress = checklist.length > 0 ? (completedCount / checklist.length) * 100 : 0

  const toggleItem = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    )
  }

  const addItem = () => {
    if (!newItem.trim()) return
    setChecklist((prev) => [
      ...prev,
      { id: Date.now().toString(), text: newItem.trim(), done: false },
    ])
    setNewItem('')
  }

  const updateIntention = (index: number, value: string) => {
    setIntentions((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const intentionsFilled = intentions.filter((i) => i.trim()).length

  return (
    <PageShell>
      {/* Hero greeting */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-2"
      >
        <div className="flex items-center gap-3 mb-1">
          <GreetingIcon className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">{getFormattedDate()}</span>
        </div>
        <h2 className="text-3xl font-semibold tracking-tight">
          {greeting.text}, <span className="font-serif italic font-normal">Pablo</span>
        </h2>
      </motion.div>

      {/* Quick stats row */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          {
            label: 'Tasks',
            value: `${completedCount}/${checklist.length}`,
            icon: CheckCircle2,
            color: completedCount === checklist.length && checklist.length > 0 ? 'text-green-400' : 'text-muted-foreground',
          },
          {
            label: 'Intentions',
            value: `${intentionsFilled}/3`,
            icon: Target,
            color: intentionsFilled === 3 ? 'text-green-400' : 'text-muted-foreground',
          },
          {
            label: 'Score',
            value: score > 0 ? `${score}/10` : '—',
            icon: Star,
            color: score >= 8 ? 'text-yellow-400' : 'text-muted-foreground',
          },
          {
            label: 'Events',
            value: isElectron ? `${calendarEvents.length}` : '—',
            icon: Calendar,
            color: 'text-muted-foreground',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="liquid-glass flex items-center gap-3 rounded-xl px-4 py-3"
          >
            <stat.icon className={`h-4 w-4 shrink-0 ${stat.color}`} />
            <div>
              <p className="text-xl font-bold tabular-nums leading-tight">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left column — checklist + schedule */}
        <div className="flex flex-col gap-5 lg:col-span-5">
          {/* Daily Checklist */}
          <WidgetCard
            title="Today's Tasks"
            description={progress === 100 ? 'All done!' : `${completedCount} of ${checklist.length} done`}
            delay={0.15}
          >
            <Progress value={progress} className="mb-4 h-1" />
            <div className="flex flex-col gap-1">
              {checklist.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary"
                >
                  <Checkbox
                    checked={item.done}
                    onCheckedChange={() => toggleItem(item.id)}
                  />
                  <span
                    className={
                      item.done
                        ? 'text-sm text-muted-foreground line-through'
                        : 'text-sm text-foreground'
                    }
                  >
                    {item.text}
                  </span>
                  {item.done && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-green-400/60" />}
                </label>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="Add task..."
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                className="h-8 bg-input text-sm"
              />
              <button
                onClick={addItem}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground transition-colors hover:bg-secondary/80"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </WidgetCard>

          {/* Schedule */}
          <WidgetCard
            title="Schedule"
            description={
              calendarLoading
                ? 'Loading...'
                : isElectron
                  ? `${calendarEvents.length} event${calendarEvents.length !== 1 ? 's' : ''} today`
                  : 'Electron only'
            }
            delay={0.25}
          >
            {isElectron ? (
              <>
                {calendarEvents.length === 0 && !calendarLoading ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <Calendar className="h-6 w-6 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">No events today</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {calendarEvents.map((event, i) => (
                      <div
                        key={`${event.title}-${i}`}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary"
                      >
                        <div className="flex flex-col items-center w-12 shrink-0">
                          <span className="text-[11px] font-semibold tabular-nums">
                            {event.isAllDay ? 'ALL' : event.startTime}
                          </span>
                          {!event.isAllDay && (
                            <span className="text-[10px] tabular-nums text-muted-foreground">{event.endTime}</span>
                          )}
                        </div>
                        <div className="h-8 w-0.5 rounded-full bg-foreground/15" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{event.title}</p>
                          <p className="text-[10px] text-muted-foreground">{event.calendar}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={fetchCalendar}
                  disabled={calendarLoading}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <RefreshCw className={`h-3 w-3 ${calendarLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6">
                <Calendar className="h-6 w-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Open in Electron to sync calendar</p>
              </div>
            )}
          </WidgetCard>
        </div>

        {/* Center column — intentions + score */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          {/* Intentions */}
          <WidgetCard title="Today's Focus" description="Set 3 intentions" delay={0.2}>
            <div className="flex flex-col gap-3">
              {intentions.map((intention, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    intention.trim()
                      ? 'bg-foreground text-background'
                      : 'bg-secondary text-muted-foreground'
                  }`}>
                    {intention.trim() ? <Zap className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <Input
                    placeholder={
                      i === 0 ? 'Most important thing today...'
                        : i === 1 ? 'Second priority...'
                          : 'Bonus goal...'
                    }
                    value={intention}
                    onChange={(e) => updateIntention(i, e.target.value)}
                    className="h-9 bg-input text-sm"
                  />
                </div>
              ))}
            </div>
          </WidgetCard>

          {/* Daily Score */}
          <WidgetCard title="Daily Score" description="How was your day?" delay={0.3}>
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="relative flex items-center justify-center">
                <svg className="h-32 w-32 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(0 0% 12%)" strokeWidth="5" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke={score >= 8 ? 'hsl(48 96% 53%)' : score >= 5 ? 'hsl(0 0% 55%)' : 'hsl(0 0% 28%)'}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${(score / 10) * 264} 264`}
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-4xl font-bold tabular-nums leading-none">
                    {score || '—'}
                  </span>
                  {score > 0 && <span className="text-[10px] text-muted-foreground mt-1">/10</span>}
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {Array.from({ length: 10 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setScore(i + 1)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-all ${
                      i + 1 <= score
                        ? i + 1 >= 8
                          ? 'bg-yellow-400/20 text-yellow-400 ring-1 ring-yellow-400/30'
                          : 'bg-foreground text-background'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          </WidgetCard>
        </div>

        {/* Right column — reflection */}
        <div className="flex flex-col gap-5 lg:col-span-3">
          <WidgetCard title="Reflection" delay={0.35}>
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Star className="h-3 w-3 text-yellow-400/70" /> Wins
                </label>
                <textarea
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  rows={3}
                  placeholder="What went well..."
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Flame className="h-3 w-3 text-orange-400/70" /> Improve
                </label>
                <textarea
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  rows={3}
                  placeholder="What could be better..."
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Zap className="h-3 w-3 text-blue-400/70" /> Learnings
                </label>
                <textarea
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  rows={3}
                  placeholder="Key takeaways..."
                />
              </div>
            </div>
          </WidgetCard>
        </div>
      </div>
    </PageShell>
  )
}
