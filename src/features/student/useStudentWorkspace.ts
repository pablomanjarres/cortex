import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, readStore, updateStoreValue } from '@/lib/store'
import { deleteFile } from '@/lib/media'
import { syncAssignmentToCalendar } from '@/lib/calendar-sync'
import { DEFAULT_ASSIGNMENTS, DEFAULT_COURSES, DEFAULT_SEMESTERS, DEFAULT_TOPICS } from './student-defaults'
import { ICON_CYCLE } from './course-icons'
import { applyAssignmentStatus, assignmentStatus, filterAssignmentsByStatus, studentOverview, type AssignmentStatus } from './student-overview'
import { CLASS_MATERIALS_KEY, STUDY_NOTES_KEY, getToday, type Assignment, type AssignmentType, type ClassMaterial, type Course, type SortKey, type StudyNote, type Topic } from './student-types'

const ALL_TYPES: AssignmentType[] = ['Exam', 'Quiz', 'Lab', 'Project', 'Presentation', 'Attendance']
const ALL_STATUSES: AssignmentStatus[] = ['Open', 'Awaiting grade', 'Graded']

function compareAssignments(a: Assignment, b: Assignment, key: SortKey, ascending: boolean) {
  const direction = ascending ? 1 : -1
  if (key === 'name') return a.name.localeCompare(b.name) * direction
  if (key === 'grade') return ((a.grade ?? -1) - (b.grade ?? -1)) * direction
  if (key === 'weight') return (a.weight - b.weight) * direction
  return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') * direction
}

export function useStudentWorkspace() {
  const [assignments, updateAssignments] = useStore<Assignment[]>('cortex-student-assignments', DEFAULT_ASSIGNMENTS)
  const [topics, updateTopics] = useStore<Topic[]>('cortex-student-topics', DEFAULT_TOPICS)
  const [courses, updateCourses] = useStore<Course[]>('cortex-student-courses', DEFAULT_COURSES)
  const [semesters, updateSemesters] = useStore<string[]>('cortex-student-semesters', DEFAULT_SEMESTERS)
  const [activeSemester, setActiveSemester] = useStore<string>('cortex-student-active-semester', DEFAULT_SEMESTERS[0])
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<Set<AssignmentType>>(() => new Set(ALL_TYPES))
  const [selectedStatuses, setSelectedStatuses] = useState<Set<AssignmentStatus>>(() => new Set(ALL_STATUSES))
  const [sortKey, setSortKey] = useState<SortKey>('deadline')
  const [sortAsc, setSortAsc] = useState(true)
  const previousAssignments = useRef<Assignment[] | null>(null)

  const courseMap = useMemo(() => Object.fromEntries(courses.map((course) => [course.id, course])) as Record<string, Course>, [courses])
  const activeCourses = useMemo(() => courses.filter((course) => course.semester === activeSemester), [courses, activeSemester])
  const activeCourseIds = useMemo(() => new Set(activeCourses.map((course) => course.id)), [activeCourses])
  const semesterAssignments = useMemo(() => assignments.filter((assignment) => activeCourseIds.has(assignment.courseId)), [assignments, activeCourseIds])
  const today = getToday()
  const overview = useMemo(() => studentOverview(courses, assignments, activeSemester, today), [courses, assignments, activeSemester, today])
  const filteredAssignments = useMemo(() => filterAssignmentsByStatus(
    semesterAssignments.filter((assignment) => (!selectedCourseId || assignment.courseId === selectedCourseId) && selectedTypes.has(assignment.type)),
    selectedStatuses,
  ).sort((a, b) => compareAssignments(a, b, sortKey, sortAsc)), [semesterAssignments, selectedCourseId, selectedTypes, selectedStatuses, sortKey, sortAsc])

  const courseSummaries = useMemo(() => Object.fromEntries(activeCourses.map((course) => {
    const mine = semesterAssignments.filter((assignment) => assignment.courseId === course.id)
    const graded = mine.filter((assignment) => assignment.grade !== undefined)
    const gradedWeight = graded.reduce((sum, assignment) => sum + assignment.weight, 0)
    const grade = gradedWeight > 0 ? graded.reduce((sum, assignment) => sum + assignment.grade! * assignment.weight, 0) / gradedWeight : undefined
    return [course.id, { openCount: mine.filter((assignment) => assignmentStatus(assignment) === 'Open').length, grade }]
  })), [activeCourses, semesterAssignments])

  const currentAverage = useMemo(() => {
    let credits = 0
    let weighted = 0
    for (const course of activeCourses) {
      const grade = courseSummaries[course.id]?.grade
      if (grade === undefined) continue
      credits += course.credits
      weighted += grade * course.credits
    }
    return credits > 0 ? weighted / credits : undefined
  }, [activeCourses, courseSummaries])

  useEffect(() => {
    const previous = previousAssignments.current
    if (previous) {
      for (const assignment of assignments) {
        const old = previous.find((item) => item.id === assignment.id)
        if (!old) continue
        const courseName = courseMap[assignment.courseId]?.name || assignment.courseId
        if (!old.done && assignment.done) syncAssignmentToCalendar(assignment, courseName, 'delete')
        else if (old.done && !assignment.done && assignment.deadline) syncAssignmentToCalendar(assignment, courseName, 'upsert')
        else if (old.deadline !== assignment.deadline || old.name !== assignment.name) syncAssignmentToCalendar(assignment, courseName, 'upsert')
      }
    }
    previousAssignments.current = assignments
  }, [assignments, courseMap])

  const changeSemester = (semester: string) => {
    setActiveSemester(() => semester)
    setSelectedCourseId(null)
    setSelectedTypes(new Set(ALL_TYPES))
    setSelectedStatuses(new Set(ALL_STATUSES))
  }
  const addSemester = (name: string) => {
    const value = name.trim()
    if (!value) return
    updateSemesters((items) => items.includes(value) ? items : [value, ...items])
    changeSemester(value)
  }
  const addCourse = (name: string) => {
    const value = name.trim()
    if (!value) return
    const id = `course-${Date.now()}`
    updateCourses((items) => [...items, { id, name: value, difficulty: 'Medium', iconKey: ICON_CYCLE[items.length % ICON_CYCLE.length], semester: activeSemester, status: 'Normal', credits: 3 }])
    setSelectedCourseId(id)
  }
  const updateCourse = (id: string, patch: Partial<Course>) => updateCourses((items) => items.map((course) => course.id === id ? { ...course, ...patch } : course))
  const deleteCourse = (id: string) => {
    assignments.filter((assignment) => assignment.courseId === id).forEach((assignment) => syncAssignmentToCalendar(assignment, courseMap[id]?.name || id, 'delete'))
    updateAssignments((items) => items.filter((assignment) => assignment.courseId !== id))
    updateTopics((items) => items.filter((topic) => topic.courseId !== id))
    updateCourses((items) => items.filter((course) => course.id !== id))
    void readStore<ClassMaterial[]>(CLASS_MATERIALS_KEY, []).then((materials) => materials.forEach((material) => { if (material.courseId === id && material.file?.mediaId) void deleteFile(material.file.mediaId) }))
    updateStoreValue<ClassMaterial[]>(CLASS_MATERIALS_KEY, [], (items) => items.filter((material) => material.courseId !== id))
    updateStoreValue<StudyNote[]>(STUDY_NOTES_KEY, [], (items) => items.filter((note) => note.courseId !== id))
    setSelectedCourseId(null)
  }
  const addAssignment = (assignment: Assignment) => {
    updateAssignments((items) => [...items, assignment])
    if (assignment.deadline) syncAssignmentToCalendar(assignment, courseMap[assignment.courseId]?.name || assignment.courseId, 'upsert')
  }
  const deleteAssignment = (id: string) => {
    const assignment = assignments.find((item) => item.id === id)
    if (assignment) syncAssignmentToCalendar(assignment, courseMap[assignment.courseId]?.name || assignment.courseId, 'delete')
    updateAssignments((items) => items.filter((item) => item.id !== id))
  }
  const patchAssignment = (id: string, patch: Partial<Assignment>) => updateAssignments((items) => items.map((assignment) => assignment.id === id ? { ...assignment, ...patch } : assignment))
  const setAssignmentStatus = (id: string, status: AssignmentStatus) => updateAssignments((items) => items.map((assignment) => assignment.id === id ? applyAssignmentStatus(assignment, status) : assignment))
  const toggleType = (type: AssignmentType) => setSelectedTypes((current) => { const next = new Set(current); if (next.has(type) && next.size > 1) next.delete(type); else next.add(type); return next })
  const toggleStatus = (status: AssignmentStatus) => setSelectedStatuses((current) => { const next = new Set(current); if (next.has(status) && next.size > 1) next.delete(status); else next.add(status); return next })
  const focusStatus = (status: AssignmentStatus) => setSelectedStatuses(new Set([status]))
  const toggleSort = (key: SortKey) => { if (key === sortKey) setSortAsc((value) => !value); else { setSortKey(key); setSortAsc(true) } }
  const revealAssignment = (assignment: Assignment) => {
    setSelectedCourseId(assignment.courseId)
    setSelectedTypes((current) => new Set([...current, assignment.type]))
    setSelectedStatuses((current) => new Set([...current, assignmentStatus(assignment)]))
  }

  return {
    assignments, topics, updateTopics, courses, semesters, activeSemester, activeCourses, courseMap, semesterAssignments,
    selectedCourseId, setSelectedCourseId, selectedTypes, selectedStatuses, sortKey, sortAsc, today, overview,
    filteredAssignments, courseSummaries, currentAverage, changeSemester, addSemester, addCourse, updateCourse, deleteCourse,
    addAssignment, deleteAssignment, patchAssignment, setAssignmentStatus, toggleType, toggleStatus, focusStatus, toggleSort, revealAssignment,
  }
}
