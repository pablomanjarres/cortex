import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Assignment, Course } from '../src/features/student/student-types.ts'

Object.assign(globalThis, { React })

const workspaceModule = await import('../src/features/student/AssignmentWorkspace.tsx').catch(() => ({}))

const course: Course = {
  id: 'course', name: 'Calculus III', semester: 'Fall', difficulty: 'Hard', iconKey: 'book', status: 'Normal', credits: 3,
}
const assignment: Assignment = {
  id: 'lab', courseId: course.id, name: 'Lab report', type: 'Lab', deadline: '2026-09-22',
  done: false, priority: 'Medium', weight: 0.2,
}

test('assignment workspace keeps due actions and responsive assignment views together', () => {
  const Workspace = (workspaceModule as { AssignmentWorkspace?: React.ComponentType<Record<string, unknown>> }).AssignmentWorkspace
  assert.equal(typeof Workspace, 'function')
  const html = renderToStaticMarkup(React.createElement(Workspace!, {
    assignments: [assignment], dueSoon: [assignment], courseMap: { course }, today: '2026-09-21',
    selectedStatuses: new Set(['Open', 'Awaiting grade', 'Graded']), selectedTypes: new Set(['Lab']),
    sortKey: 'deadline', sortAsc: true, onToggleStatus: () => {}, onToggleType: () => {}, onToggleSort: () => {},
    onOpenAssignment: () => {}, onStatusChange: () => {}, onDeadlineChange: () => {}, onGradeChange: () => {},
    onWeightChange: () => {}, onTypeChange: () => {}, onDeleteAssignment: () => {}, onAddAssignment: () => {},
  }))
  assert.match(html, /Due soon/)
  assert.match(html, /aria-label="Open Lab report"/)
  assert.match(html, /aria-label="Edit deadline for Lab report"/)
  assert.match(html, /aria-label="Status for Lab report"/)
  assert.match(html, /All assignments/)
  assert.match(html, /hidden[^\"]*sm:table/)
  assert.match(html, /sm:hidden/)
})
