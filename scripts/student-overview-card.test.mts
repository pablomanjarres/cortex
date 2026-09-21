import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StudentSection } from '../src/features/student/StudentSection.tsx'

Object.assign(globalThis, { React })

test('student overview opens as the compact assignment workspace', () => {
  const html = renderToStaticMarkup(React.createElement(StudentSection))
  assert.match(html, /Assignments/)
  assert.match(html, /Awaiting grade/)
  assert.match(html, /Courses/)
  assert.doesNotMatch(html, /Study flow/)
  assert.doesNotMatch(html, /P\.R\.E\.P/)
})
