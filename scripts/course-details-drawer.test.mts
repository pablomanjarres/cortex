import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Assignment, Course } from '../src/features/student/student-types.ts'

Object.assign(globalThis, { React })

const drawerModule = await import('../src/features/student/CourseDetailsDrawer.tsx').catch(() => ({}))

const course: Course = {
  id: 'systems', name: 'Systems Engineering', semester: 'Fall', difficulty: 'Medium', iconKey: 'book', status: 'Normal', credits: 3,
}
const graded: Assignment = {
  id: 'exam', courseId: course.id, name: 'Exam', type: 'Exam', done: true, grade: 4.5, weight: 0.5, priority: 'Medium',
}

test('course details stay compact until the selected course is expanded', () => {
  const Drawer = (drawerModule as { CourseDetailsDrawer?: React.ComponentType<Record<string, unknown>> }).CourseDetailsDrawer
  assert.equal(typeof Drawer, 'function')
  const html = renderToStaticMarkup(React.createElement(Drawer!, {
    course, assignments: [graded], topics: [], semesters: ['Fall'], onUpdateTopics: () => {},
    onUpdateCourse: () => {}, onDeleteCourse: () => {}, onAddAssignment: () => {},
  }))
  assert.match(html, /<details/)
  assert.doesNotMatch(html, /<details open/)
  assert.match(html, /Systems Engineering/)
  assert.match(html, /3 credits/)
  assert.match(html, /Current 4\.5/)
  assert.match(html, /Topics/)
  assert.match(html, /Course notes/)
})
