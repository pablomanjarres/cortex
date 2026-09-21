import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Assignment, AssignmentType, Course } from './student-types'

export type QuickAddMode = 'semester' | 'course' | 'assignment' | null

interface StudentQuickAddProps {
  mode: QuickAddMode
  courses: Course[]
  selectedCourseId: string | null
  onAddSemester: (name: string) => void
  onAddCourse: (name: string) => void
  onAddAssignment: (assignment: Assignment) => void
  onClose: () => void
}

const TYPES: AssignmentType[] = ['Exam', 'Quiz', 'Lab', 'Project', 'Presentation', 'Attendance']

export function StudentQuickAdd({ mode, courses, selectedCourseId, onAddSemester, onAddCourse, onAddAssignment, onClose }: StudentQuickAddProps) {
  const [name, setName] = useState('')
  const [courseId, setCourseId] = useState(() => selectedCourseId ?? courses[0]?.id ?? '')
  const [type, setType] = useState<AssignmentType>('Exam')
  const [weight, setWeight] = useState('')
  const [deadline, setDeadline] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode) requestAnimationFrame(() => nameRef.current?.focus())
  }, [mode])

  if (!mode) return null

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (mode === 'semester') onAddSemester(trimmed)
    if (mode === 'course') onAddCourse(trimmed)
    if (mode === 'assignment' && courseId) {
      onAddAssignment({
        id: `custom-${Date.now()}`, name: trimmed, courseId, type, weight: Number(weight) / 100 || 0,
        deadline: deadline || undefined, done: false, priority: 'Medium',
      })
    }
    onClose()
  }

  const title = mode === 'semester' ? 'Add semester' : mode === 'course' ? 'Add course' : 'Add assignment'
  return (
    <section className="surface rounded-2xl p-3 sm:p-4" aria-label={title}>
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}><X /></Button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-2xs text-muted-foreground sm:col-span-2 lg:col-span-2">
          Name
          <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); if (event.key === 'Escape') onClose() }} className="mt-1 min-h-11 w-full rounded-xl border border-input bg-input/20 px-3 text-sm text-foreground outline-none" />
        </label>
        {mode === 'assignment' ? (
          <>
            <label className="text-2xs text-muted-foreground">Course<select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-input bg-input/20 px-2 text-xs text-foreground">{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
            <label className="text-2xs text-muted-foreground">Type<select value={type} onChange={(event) => setType(event.target.value as AssignmentType)} className="mt-1 min-h-11 w-full rounded-xl border border-input bg-input/20 px-2 text-xs text-foreground">{TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="text-2xs text-muted-foreground">Weight %<input type="number" min="0" max="100" value={weight} onChange={(event) => setWeight(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-input bg-input/20 px-2 text-xs text-foreground" /></label>
            <label className="text-2xs text-muted-foreground">Deadline<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-input bg-input/20 px-2 text-xs text-foreground" /></label>
          </>
        ) : null}
      </div>
      <div className="mt-3 flex justify-end"><Button size="sm" onClick={submit} disabled={!name.trim() || (mode === 'assignment' && !courseId)} className="min-h-11 sm:min-h-8"><Plus /> {title}</Button></div>
    </section>
  )
}
