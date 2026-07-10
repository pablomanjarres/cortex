import { useState } from 'react'
import { useStore } from '@/lib/store'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
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

// Shared token style for native <select> controls (mirrors the Input primitive;
// the global :focus-visible rule supplies the focus ring).
const selectCls =
  'h-8 cursor-pointer rounded-md border border-input bg-input/20 px-2 text-sm text-foreground transition-colors duration-150 outline-none'

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
    <div className="flex flex-col gap-2.5 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={draft.courseId}
          onChange={(e) => setDraft((p) => ({ ...p, courseId: e.target.value }))}
          className={selectCls}
        >
          {courses.length === 0 && <option value="">No courses</option>}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          {DAY_LABELS.map((lbl, i) => (
            <Button
              key={lbl}
              type="button"
              variant={draft.days.includes(i) ? 'accent-outline' : 'secondary'}
              size="sm"
              onClick={() => toggleDay(i)}
              aria-pressed={draft.days.includes(i)}
              className="w-9 px-0 font-mono"
            >
              {lbl.slice(0, 2)}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <Input type="time" value={draft.startTime} onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))} className="w-28 font-mono text-xs" />
          <span>–</span>
          <Input type="time" value={draft.endTime} onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))} className="w-28 font-mono text-xs" />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <Input value={draft.room} onChange={(e) => setDraft((p) => ({ ...p, room: e.target.value }))} placeholder="Room" className="w-28 text-xs" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Term</span>
          <Input type="date" value={draft.termStart} onChange={(e) => setDraft((p) => ({ ...p, termStart: e.target.value }))} className="w-36 font-mono text-xs" />
          <span>→</span>
          <Input type="date" value={draft.termEnd} onChange={(e) => setDraft((p) => ({ ...p, termEnd: e.target.value }))} className="w-36 font-mono text-xs" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={!canSave}>
            <Check /> {editingId ? 'Save' : 'Add'}
          </Button>
          <Button variant="ghost" size="sm" onClick={cancel}>
            Cancel
          </Button>
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
            <div key={c.id} className="group flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{c.courseName}</span>
                  <span className="flex gap-0.5">
                    {c.days.map((d) => (
                      <Chip key={d} size="sm">{DAY_LABELS[d]?.slice(0, 2)}</Chip>
                    ))}
                  </span>
                </div>
                <div className="font-mono text-2xs tabular-nums text-muted-foreground">
                  {c.startTime}–{c.endTime}
                  {c.room ? ` · ${c.room}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Button variant="ghost" size="icon-sm" onClick={() => startEdit(c)} aria-label={`Edit ${c.courseName}`}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(c)} aria-label={`Remove ${c.courseName}`} className="hover:text-destructive">
                  <X />
                </Button>
              </div>
            </div>
          )
        )}

        {adding && editingId === null ? (
          renderForm()
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setAdding(true)
              setEditingId(null)
              setDraft(emptyDraft())
            }}
            className="w-full border-dashed text-muted-foreground hover:border-accent/40 hover:text-foreground"
          >
            <Plus /> Add class
          </Button>
        )}
      </div>
    </WidgetCard>
  )
}
