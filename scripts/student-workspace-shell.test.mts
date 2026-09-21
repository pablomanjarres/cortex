import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Course } from '../src/features/student/student-types.ts'

Object.assign(globalThis, { React })

const headerModule = await import('../src/features/student/StudentWorkspaceHeader.tsx').catch(() => ({}))
const selectorModule = await import('../src/features/student/CourseSelector.tsx').catch(() => ({}))

const courses: Course[] = [
  { id: 'algorithms', name: 'Algorithms', semester: 'Fall', difficulty: 'Hard', iconKey: 'book', status: 'Normal', credits: 3 },
  { id: 'databases', name: 'Databases', semester: 'Fall', difficulty: 'Medium', iconKey: 'book', status: 'Normal', credits: 3 },
]

test('workspace header exposes compact status filters and the current average', () => {
  const Header = (headerModule as { StudentWorkspaceHeader?: React.ComponentType<Record<string, unknown>> }).StudentWorkspaceHeader
  assert.equal(typeof Header, 'function')
  const html = renderToStaticMarkup(React.createElement(Header!, {
    semesters: ['Fall'], activeSemester: 'Fall', openCount: 4, awaitingGradeCount: 2,
    currentAverage: 4.6, onChangeSemester: () => {}, onAddSemester: () => {},
    onAddAssignment: () => {}, onStatusFilter: () => {},
  }))
  assert.match(html, /Open[^<]*4/)
  assert.match(html, /Awaiting grade[^<]*2/)
  assert.match(html, /Current average[^<]*4\.6/)
  assert.match(html, /Add assignment/)
})

test('course selector keeps all courses and the selected course close to assignments', () => {
  const Selector = (selectorModule as { CourseSelector?: React.ComponentType<Record<string, unknown>> }).CourseSelector
  assert.equal(typeof Selector, 'function')
  const html = renderToStaticMarkup(React.createElement(Selector!, {
    courses,
    selectedCourseId: 'algorithms',
    courseSummaries: { algorithms: { openCount: 2, grade: 4.8 }, databases: { openCount: 1 } },
    onSelectCourse: () => {}, onAddCourse: () => {},
  }))
  assert.match(html, /All courses/)
  assert.match(html, /Algorithms/)
  assert.match(html, /Databases/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /Add course/)
})
