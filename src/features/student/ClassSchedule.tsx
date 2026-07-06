import { useState } from 'react'
import { useStore } from '@/lib/store'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { syncClassToCalendar } from '@/lib/calendar-sync'
import { Plus, X, Pencil, Check, Clock, MapPin } from 'lucide-react'

// A recurring weekly class. Saved in the `cortex-classes` store and pushed to the
// calendar as a purple weekly-recurring event (via syncClassToCalendar).
export interface ClassMeeting {
  id: string
  courseId: string
  courseName: string
  days: number[]      // 0=Mon … 6=Sun
  startTime: string   // "HH:MM"
  endTime: string     // "HH:MM"
  room?: string
  termStart: string   // "YYYY-MM-DD"
  termEnd: string     // "YYYY-MM-DD"
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DEFAULT_TERM_START = '2026-07-15'
const DEFAULT_TERM_END = '2026-11-28'

interface Draft {
  courseId: string
  days: number[]
  startTime: string
  endTime: string
  room: string
  termStart: string
  termEnd: string
}

interface Props {
  courses: { id: string; name: string }[]
}

export function ClassSchedule({ courses }: Props) {
  const [classes, updateClasses] = useStore<ClassMeeting[]>('cortex-classes', [])
  const setClasses = (fn: (p: ClassMeeting[]) => ClassMeeting[]) => updateClasses(fn)

  const emptyDraft = (): Draft => ({
    courseId: courses[0]?.id ?? '',
    days: [],
    startTime: '10:00',
    endTime: '11:30',
    room: '',
    termStart: DEFAULT_TERM_START,
    termEnd: DEFAULT_TERM_END,
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft())

  const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? id

  const toggleDay = (d: number) =>
    setDraft((prev) => ({
      ...prev,
      days: prev.days.includes(d) ? prev.days.filter((x) => x !== d) : [...prev.days, d].sort((a, b) => a - b),
    }))

  const save = () => {
    if (!draft.courseId || draft.days.length === 0 || !draft.startTime) return
    const record: ClassMeeting = {
      id: editingId ?? Date.now().toString(),
      courseId: draft.courseId,
      courseName: courseName(draft.courseId),
      days: draft.days,
      startTime: draft.startTime,
      endTime: draft.endTime || draft.startTime,
      room: draft.room.trim() || undefined,
      termStart: draft.termStart,
      termEnd: draft.termEnd,
    }
    setClasses((prev) => {
      const idx = prev.findIndex((c) => c.id === record.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = record
        return next
      }
      return [...prev, record]
    })
    // Fire-and-forget push to the calendar; reconcileClasses on next load is the
    // safety net if the sync lock is momentarily held.
    void syncClassToCalendar(record, 'upsert')
    setEditingId(null)
    setAdding(false)
    setDraft(emptyDraft())
  }

  const startEdit = (c: ClassMeeting) => {
    setAdding(false)
    setEditingId(c.id)
    setDraft({
      courseId: c.courseId,
      days: c.days,
      startTime: c.startTime,
      endTime: c.endTime,
      room: c.room ?? '',
      termStart: c.termStart,
      termEnd: c.termEnd,
    })
  }

  const remove = (c: ClassMeeting) => {
    setClasses((prev) => prev.filter((x) => x.id !== c.id))
    void syncClassToCalendar(c, 'delete')
    if (editingId === c.id) {
      setEditingId(null)
      setDraft(emptyDraft())
    }
  }

  const cancel = () => {
    setEditingId(null)
    setAdding(false)
    setDraft(emptyDraft())
  }

  const sorted = [...classes].sort(
    (a, b) => (a.days[0] ?? 9) - (b.days[0] ?? 9) || a.startTime.localeCompare(b.startTime)
  )

  const canSave = !!draft.courseId && draft.days.length > 0 && !!draft.startTime

  const renderForm = () => (
    <div className="flex flex-col gap-2.5 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={draft.courseId}
          onChange={(e) => setDraft((p) => ({ ...p, courseId: e.target.value }))}
          className="h-8 rounded-md border border-border bg-input px-2 text-sm text-foreground"
        >
          {courses.length === 0 && <option value="">No courses</option>}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          {DAY_LABELS.map((lbl, i) => (
            <button
              key={lbl}
              type="button"
              onClick={() => toggleDay(i)}
              className={`h-8 w-9 rounded-md text-xs font-medium transition-colors ${
                draft.days.includes(i)
                  ? 'bg-purple-500 text-white'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              }`}
            >
              {lbl.slice(0, 2)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <Input type="time" value={draft.startTime} onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))} className="h-8 w-28 bg-input text-sm" />
          <span>–</span>
          <Input type="time" value={draft.endTime} onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))} className="h-8 w-28 bg-input text-sm" />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <Input value={draft.room} onChange={(e) => setDraft((p) => ({ ...p, room: e.target.value }))} placeholder="Room" className="h-8 w-28 bg-input text-sm" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Term</span>
          <Input type="date" value={draft.termStart} onChange={(e) => setDraft((p) => ({ ...p, termStart: e.target.value }))} className="h-8 w-36 bg-input text-sm" />
          <span>→</span>
          <Input type="date" value={draft.termEnd} onChange={(e) => setDraft((p) => ({ ...p, termEnd: e.target.value }))} className="h-8 w-36 bg-input text-sm" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={save}
            disabled={!canSave}
            className="flex h-8 items-center gap-1 rounded-md bg-purple-500 px-3 text-sm font-medium text-white transition-colors hover:bg-purple-500/90 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            {editingId ? 'Save' : 'Add'}
          </button>
          <button onClick={cancel} className="h-8 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <WidgetCard
      title="Class Schedule"
      description={
        classes.length
          ? `${classes.length} weekly ${classes.length === 1 ? 'class' : 'classes'} · synced to your calendar in purple`
          : 'Add your weekly classes — they sync to your calendar in purple'
      }
      delay={0.2}
    >
      <div className="flex flex-col gap-2">
        {sorted.map((c) =>
          editingId === c.id ? (
            <div key={c.id}>{renderForm()}</div>
          ) : (
            <div key={c.id} className="group flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-purple-400" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{c.courseName}</span>
                  <span className="flex gap-0.5">
                    {c.days.map((d) => (
                      <span key={d} className="rounded bg-purple-500/15 px-1 text-[10px] font-medium text-purple-300">
                        {DAY_LABELS[d]?.slice(0, 2)}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.startTime}–{c.endTime}
                  {c.room ? ` · ${c.room}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => startEdit(c)} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => remove(c)} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-red-400">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        )}

        {adding && editingId === null ? (
          renderForm()
        ) : (
          <button
            onClick={() => {
              setAdding(true)
              setEditingId(null)
              setDraft(emptyDraft())
            }}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-purple-500/40 py-2 text-sm text-purple-300 transition-colors hover:bg-purple-500/5"
          >
            <Plus className="h-4 w-4" /> Add class
          </button>
        )}
      </div>
    </WidgetCard>
  )
}
