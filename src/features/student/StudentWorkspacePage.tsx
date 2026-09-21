import { useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { StudentWorkspaceHeader } from './StudentWorkspaceHeader'
import { CourseSelector } from './CourseSelector'
import { AssignmentWorkspace } from './AssignmentWorkspace'
import { CourseDetailsDrawer } from './CourseDetailsDrawer'
import { StudentQuickAdd, type QuickAddMode } from './StudentQuickAdd'
import { ClassSchedule } from './ClassSchedule'
import { useStudentWorkspace } from './useStudentWorkspace'
import type { Assignment } from './student-types'

export function StudentWorkspacePage() {
  const student = useStudentWorkspace()
  const [quickAdd, setQuickAdd] = useState<QuickAddMode>(null)
  const selectedCourse = student.selectedCourseId ? student.courseMap[student.selectedCourseId] : undefined

  const openAssignment = (assignment: Assignment) => {
    student.revealAssignment(assignment)
    requestAnimationFrame(() => {
      const row = document.getElementById(`student-assignment-${assignment.id}`)
        ?? document.getElementById(`student-assignment-card-${assignment.id}`)
      row?.scrollIntoView({ block: 'center' })
      row?.focus({ preventScroll: true })
    })
  }

  const changeGrade = (id: string, grade?: number) => {
    const assignment = student.assignments.find((item) => item.id === id)
    student.patchAssignment(id, { grade, done: grade !== undefined ? true : assignment?.done })
  }

  return (
    <PageShell>
      <StudentWorkspaceHeader
        semesters={student.semesters}
        activeSemester={student.activeSemester}
        openCount={student.overview.openCount}
        awaitingGradeCount={student.overview.awaitingGradeCount}
        currentAverage={student.currentAverage}
        onChangeSemester={student.changeSemester}
        onAddSemester={() => setQuickAdd('semester')}
        onAddAssignment={() => setQuickAdd('assignment')}
        onStatusFilter={student.focusStatus}
      />

      {quickAdd ? (
        <StudentQuickAdd
          key={`${quickAdd}-${student.selectedCourseId ?? 'all'}`}
          mode={quickAdd}
          courses={student.activeCourses}
          selectedCourseId={student.selectedCourseId}
          onAddSemester={student.addSemester}
          onAddCourse={student.addCourse}
          onAddAssignment={student.addAssignment}
          onClose={() => setQuickAdd(null)}
        />
      ) : null}

      <div className="space-y-3 lg:flex lg:items-start lg:gap-3 lg:space-y-0">
        <CourseSelector
          courses={student.activeCourses}
          selectedCourseId={student.selectedCourseId}
          courseSummaries={student.courseSummaries}
          onSelectCourse={student.setSelectedCourseId}
          onAddCourse={() => setQuickAdd('course')}
        />
        <div className="min-w-0 flex-1">
          <AssignmentWorkspace
            assignments={student.filteredAssignments}
            dueSoon={student.overview.deadlineQueue}
            courseMap={student.courseMap}
            today={student.today}
            selectedStatuses={student.selectedStatuses}
            selectedTypes={student.selectedTypes}
            sortKey={student.sortKey}
            sortAsc={student.sortAsc}
            onToggleStatus={student.toggleStatus}
            onToggleType={student.toggleType}
            onToggleSort={student.toggleSort}
            onAddAssignment={() => setQuickAdd('assignment')}
            onOpenAssignment={openAssignment}
            onStatusChange={student.setAssignmentStatus}
            onDeadlineChange={(id, deadline) => student.patchAssignment(id, { deadline })}
            onGradeChange={changeGrade}
            onWeightChange={(id, weight) => student.patchAssignment(id, { weight })}
            onTypeChange={(id, type) => student.patchAssignment(id, { type })}
            onDeleteAssignment={student.deleteAssignment}
          />
        </div>
      </div>

      {selectedCourse ? (
        <CourseDetailsDrawer
          course={selectedCourse}
          assignments={student.assignments}
          topics={student.topics}
          semesters={student.semesters}
          onUpdateTopics={student.updateTopics}
          onUpdateCourse={(patch) => student.updateCourse(selectedCourse.id, patch)}
          onDeleteCourse={() => student.deleteCourse(selectedCourse.id)}
          onAddAssignment={() => setQuickAdd('assignment')}
        />
      ) : null}

      <ClassSchedule courses={student.activeCourses.map((course) => ({ id: course.id, name: course.name }))} />
    </PageShell>
  )
}
