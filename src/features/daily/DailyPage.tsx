import { useState, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Plus, Star, Calendar, RefreshCw } from 'lucide-react'

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

export function DailyPage() {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(defaultChecklist)
  const [newItem, setNewItem] = useState('')
  const [intentions, setIntentions] = useState(['', '', ''])
  const [score, setScore] = useState(0)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const isElectron = !!window.electronAPI?.calendar

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

  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Daily Checklist */}
        <WidgetCard
          title="Daily Checklist"
          description={`${completedCount}/${checklist.length} completed`}
          className="xl:col-span-1"
          delay={0}
        >
          <Progress value={progress} className="mb-4 h-1.5" />
          <div className="flex flex-col gap-2">
            {checklist.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary"
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
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="Add item..."
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

        {/* Morning Intentions */}
        <WidgetCard title="Morning Intentions" description="3 things to accomplish today" delay={0.1}>
          <div className="flex flex-col gap-3">
            {intentions.map((intention, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <Input
                  placeholder={`Intention ${i + 1}...`}
                  value={intention}
                  onChange={(e) => updateIntention(i, e.target.value)}
                  className="h-8 bg-input text-sm"
                />
              </div>
            ))}
          </div>
        </WidgetCard>

        {/* Daily Score */}
        <WidgetCard title="Daily Score" description="Rate your day 1-10" delay={0.2}>
          <div className="flex flex-col items-center gap-4 py-2">
            <span className="text-5xl font-bold tabular-nums text-foreground">
              {score || '—'}
            </span>
            <div className="flex gap-1">
              {Array.from({ length: 10 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setScore(i + 1)}
                  className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-all ${
                    i + 1 <= score
                      ? 'bg-foreground text-background'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </WidgetCard>

        {/* Today's Schedule — from Apple Calendar */}
        <WidgetCard
          title="Today's Schedule"
          description={
            calendarLoading
              ? 'Loading...'
              : isElectron
                ? `${calendarEvents.length} event${calendarEvents.length !== 1 ? 's' : ''}`
                : 'Available in Electron app'
          }
          delay={0.3}
          className="lg:col-span-2 xl:col-span-3"
        >
          {isElectron ? (
            <>
              <div className="mb-3 flex justify-end">
                <button
                  onClick={fetchCalendar}
                  disabled={calendarLoading}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <RefreshCw className={`h-3 w-3 ${calendarLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              {calendarEvents.length === 0 && !calendarLoading ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Calendar className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No events today — or grant calendar access in System Settings
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {calendarEvents.map((event, i) => (
                    <div
                      key={`${event.title}-${i}`}
                      className="flex items-center gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-secondary"
                    >
                      <span className="w-14 text-xs font-medium tabular-nums text-muted-foreground">
                        {event.isAllDay ? 'All day' : event.startTime}
                      </span>
                      <div className="h-2 w-2 shrink-0 rounded-full bg-foreground/30" />
                      <span className="flex-1 text-sm text-foreground">{event.title}</span>
                      {!event.isAllDay && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {event.startTime} – {event.endTime}
                        </span>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {event.calendar}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <Calendar className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Open in the Electron app to see your Apple Calendar events
              </p>
            </div>
          )}
        </WidgetCard>

        {/* Evening Reflection */}
        <WidgetCard title="Evening Reflection" delay={0.4}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Star className="h-3 w-3" /> What went well?
              </label>
              <textarea
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
                placeholder="Today's wins..."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                What could improve?
              </label>
              <textarea
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
                placeholder="Areas for growth..."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Key learnings
              </label>
              <textarea
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
                placeholder="What did you learn today..."
              />
            </div>
          </div>
        </WidgetCard>
      </div>
    </PageShell>
  )
}
