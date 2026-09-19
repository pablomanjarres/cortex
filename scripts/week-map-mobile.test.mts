import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WeekMap } from '../src/features/daily/components/WeekMap.tsx'
import type { Assignment } from '../src/features/student/student-types.ts'
import type { SprintSession } from '../src/lib/sprint-context.tsx'

// tsx's Node transform uses the classic JSX runtime for imported components.
Object.assign(globalThis, { React })

const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']
const assignment: Assignment = {
  id: 'lab', name: 'Architecture lab', courseId: 'cs', type: 'Lab',
  weight: 0.2, deadline: '2026-09-15', done: false, priority: 'Medium',
}
const session: SprintSession = {
  id: 'focus', task: 'Plan the week', duration: 90,
  startedAt: '2026-09-15T09:00:00', completedAt: '2026-09-15T10:30:00',
}

test('compact week selectors summarize every source while the selected agenda keeps event details', () => {
  const html = renderToStaticMarkup(React.createElement(WeekMap, {
    days, today: '2026-09-19', selectedDay: '2026-09-15', onSelectedDay: () => {},
    sessionsByDay: { '2026-09-15': [session] },
    events: [{ id: 'calendar', title: 'Architecture review with a long descriptive title',
      startDate: '2026-09-15T11:00:00', endDate: '2026-09-15T12:00:00',
      calendar: 'Work', isAllDay: false }],
    assignments: [assignment], courseNames: new Map([['cs', 'Computer science']]),
    calendarState: 'ready', onOpenCalendar: () => {}, onOpenStudent: () => {},
  }))

  assert.equal([...html.matchAll(/aria-pressed="(?:true|false)"/g)].length, 7)
  assert.match(html, /aria-label="Tuesday, September 15: 1 calendar event, 1 focus session, 1 deadline"/)
  assert.match(html, /Architecture review with a long descriptive title/)
  assert.match(html, /Computer science/)
})
