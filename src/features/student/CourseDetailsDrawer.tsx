import { useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import type { Assignment, Course, CourseStatus, Difficulty, Priority, Topic, TopicStatus } from './student-types'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']
const COURSE_STATUSES: CourseStatus[] = ['Normal', 'At risk', 'Under Control']
const TOPIC_STATUSES: TopicStatus[] = ['Not seen', 'Previewed', 'Seen', 'Practiced', 'Mastered']

interface CourseDetailsDrawerProps {
  course: Course
  assignments: Assignment[]
  topics: Topic[]
  semesters: string[]
  onUpdateTopics: (fn: (topics: Topic[]) => Topic[]) => void
  onUpdateCourse: (patch: Partial<Course>) => void
  onDeleteCourse: () => void
  onAddAssignment: () => void
}

export function CourseDetailsDrawer({ course, assignments, topics, semesters, onUpdateTopics, onUpdateCourse, onDeleteCourse, onAddAssignment }: CourseDetailsDrawerProps) {
  const [newTopic, setNewTopic] = useState('')
  const mine = assignments.filter((assignment) => assignment.courseId === course.id)
  const myTopics = topics.filter((topic) => topic.courseId === course.id)
  const totalWeight = mine.reduce((sum, assignment) => sum + assignment.weight, 0)
  const graded = mine.filter((assignment) => assignment.grade !== undefined)
  const gradedWeight = graded.reduce((sum, assignment) => sum + assignment.weight, 0)
  const gradeSum = graded.reduce((sum, assignment) => sum + assignment.grade! * assignment.weight, 0)
  const currentGrade = gradedWeight > 0 ? gradeSum / gradedWeight : undefined
  const ungradedWeight = Math.max(0, totalWeight - gradedWeight)
  const best = totalWeight > 0 ? (gradeSum + 5 * ungradedWeight) / totalWeight : 5
  const worst = totalWeight > 0 ? gradeSum / totalWeight : 0
  const gradedPercent = totalWeight > 0 ? Math.round((gradedWeight / totalWeight) * 100) : 0

  const addTopic = () => {
    const name = newTopic.trim()
    if (!name) return
    onUpdateTopics((items) => [...items, {
      id: `topic-${Date.now()}`, courseId: course.id, name, chapter: '', types: ['Concept'],
      mastery: 0, status: 'Not seen' as TopicStatus, priority: 'Medium' as Priority,
    }])
    setNewTopic('')
  }

  const cycleTopic = (id: string) => onUpdateTopics((items) => items.map((topic) => {
    if (topic.id !== id) return topic
    const next = TOPIC_STATUSES[(TOPIC_STATUSES.indexOf(topic.status) + 1) % TOPIC_STATUSES.length]
    return { ...topic, status: next, mastery: TOPIC_STATUSES.indexOf(next) * 25 }
  }))

  return (
    <details className="surface group rounded-2xl">
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{course.name}</span>
          <span className="block text-2xs text-muted-foreground">{course.credits} credits · {course.difficulty} · {gradedPercent}% graded</span>
        </span>
        <Chip variant={currentGrade !== undefined && currentGrade >= 3 ? 'success' : 'neutral'} size="sm">
          Current {currentGrade?.toFixed(1) ?? '—'}
        </Chip>
        <span className="text-2xs text-muted-foreground">Course details</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="grid gap-4 border-t border-border/60 p-3 sm:grid-cols-2 sm:p-4">
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Course settings</h3>
            <Button variant="secondary" size="sm" onClick={onAddAssignment}><Plus /> Assignment</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-2xs text-muted-foreground">Name<input value={course.name} onChange={(event) => onUpdateCourse({ name: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-input bg-input/20 px-2 text-xs text-foreground" /></label>
            <label className="text-2xs text-muted-foreground">Semester<select value={course.semester} onChange={(event) => onUpdateCourse({ semester: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-input bg-input/20 px-2 text-xs text-foreground">{semesters.map((semester) => <option key={semester}>{semester}</option>)}</select></label>
            <label className="text-2xs text-muted-foreground">Credits<input type="number" min="0" value={course.credits} onChange={(event) => onUpdateCourse({ credits: Number(event.target.value) })} className="mt-1 min-h-10 w-full rounded-lg border border-input bg-input/20 px-2 text-xs text-foreground" /></label>
            <label className="text-2xs text-muted-foreground">Difficulty<select value={course.difficulty} onChange={(event) => onUpdateCourse({ difficulty: event.target.value as Difficulty })} className="mt-1 min-h-10 w-full rounded-lg border border-input bg-input/20 px-2 text-xs text-foreground">{DIFFICULTIES.map((difficulty) => <option key={difficulty}>{difficulty}</option>)}</select></label>
            <label className="col-span-2 text-2xs text-muted-foreground">Status<select value={course.status} onChange={(event) => onUpdateCourse({ status: event.target.value as CourseStatus })} className="mt-1 min-h-10 w-full rounded-lg border border-input bg-input/20 px-2 text-xs text-foreground">{COURSE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 rounded-xl bg-secondary/35 p-2 text-center">
            <span><b className="block font-mono text-sm">{currentGrade?.toFixed(1) ?? '—'}</b><small className="text-3xs text-muted-foreground">Current</small></span>
            <span><b className="block font-mono text-sm text-success">{best.toFixed(1)}</b><small className="text-3xs text-muted-foreground">Best</small></span>
            <span><b className="block font-mono text-sm">{worst.toFixed(1)}</b><small className="text-3xs text-muted-foreground">Worst</small></span>
            <span><b className="block font-mono text-sm">{gradedPercent}%</b><small className="text-3xs text-muted-foreground">Graded</small></span>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Topics</h3><span className="text-2xs text-muted-foreground">Select a topic to advance it</span></div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {myTopics.map((topic) => (
              <div key={topic.id} className="flex items-center gap-2 rounded-lg bg-secondary/30 px-2 py-1.5">
                <button type="button" onClick={() => cycleTopic(topic.id)} className="min-w-0 flex-1 truncate text-left text-xs">{topic.name}</button>
                <span className="text-2xs text-muted-foreground">{topic.status}</span>
                <Button variant="ghost" size="icon-xs" onClick={() => onUpdateTopics((items) => items.filter((item) => item.id !== topic.id))} aria-label={`Delete ${topic.name}`}><Trash2 /></Button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2"><input value={newTopic} onChange={(event) => setNewTopic(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addTopic() }} placeholder="Add topic" className="min-h-10 min-w-0 flex-1 rounded-lg border border-input bg-input/20 px-2 text-xs" /><Button variant="ghost" size="sm" onClick={addTopic}><Plus /> Add</Button></div>
        </section>

        <label className="text-2xs text-muted-foreground sm:col-span-2">Course notes<textarea value={course.notes ?? ''} onChange={(event) => onUpdateCourse({ notes: event.target.value })} placeholder="Class notes, formulas, reminders" className="mt-1 min-h-24 max-h-48 w-full resize-y rounded-xl border border-input bg-input/20 p-3 text-xs leading-relaxed text-foreground" /></label>
        <div className="sm:col-span-2 flex justify-end"><Button variant="ghost" size="sm" onClick={onDeleteCourse} className="text-destructive hover:text-destructive"><Trash2 /> Delete course</Button></div>
      </div>
    </details>
  )
}
