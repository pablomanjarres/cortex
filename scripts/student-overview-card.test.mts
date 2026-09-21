import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StudentOverviewCards } from '../src/features/student/StudentOverviewCards.tsx'
import type { Assignment } from '../src/features/student/student-types.ts'

Object.assign(globalThis, { React })

const next: Assignment = {
  id: 'due', courseId: 'course', name: 'Lab report', type: 'Lab', deadline: '2026-09-20',
  done: false, priority: 'Medium', weight: 0.2,
}

test('study hero uses the selected local day for overdue copy', () => {
  const html = renderToStaticMarkup(React.createElement(StudentOverviewCards, {
    today: '2026-09-21', semester: 'Fall',
    overview: { courseCount: 1, openCount: 1, awaitingGradeCount: 0, dueThisWeek: 0, overdueCount: 1, priorityAssignment: next, deadlineQueue: [next] },
    onOpenPriority: () => {}, onAddCourse: () => {}, onAddAssignment: () => {},
  }))
  assert.match(html, /Needs your attention/)
  assert.match(html, /Overdue since/)
})

test('open work card keeps awaiting grades visible but outside the open count', () => {
  const html = renderToStaticMarkup(React.createElement(StudentOverviewCards, {
    today: '2026-09-21', semester: 'Fall',
    overview: { courseCount: 1, openCount: 1, awaitingGradeCount: 2, dueThisWeek: 0, overdueCount: 0, deadlineQueue: [] },
    onOpenPriority: () => {}, onAddCourse: () => {}, onAddAssignment: () => {},
  }))
  assert.match(html, />1<\/p><p[^>]*>2 awaiting grade<\/p>/)
})
