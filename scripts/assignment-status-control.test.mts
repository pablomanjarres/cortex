import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

Object.assign(globalThis, { React })

const statusModule = await import('../src/features/student/AssignmentStatusControl.tsx').catch(() => ({}))

test('assignment status control exposes all valid states with its current value', () => {
  const Control = (statusModule as { AssignmentStatusControl?: React.ComponentType<Record<string, unknown>> }).AssignmentStatusControl
  assert.equal(typeof Control, 'function')
  const html = renderToStaticMarkup(React.createElement(Control!, {
    assignmentName: 'Lab report', status: 'Open', onChange: () => {},
  }))
  assert.match(html, /aria-label="Status for Lab report"/)
  assert.match(html, /<option value="Open" selected="">Open<\/option>/)
  assert.match(html, /<option value="Awaiting grade">Awaiting grade<\/option>/)
  assert.match(html, /<option value="Graded">Graded<\/option>/)
})
