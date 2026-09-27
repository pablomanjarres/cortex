import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { DailyPage } from '../src/features/daily/DailyPage.tsx'
import { SprintProvider } from '../src/lib/sprint-context.tsx'

// tsx's Node transform uses the classic JSX runtime for imported components.
Object.assign(globalThis, { React })

test('Today shortcuts precede the calendar panels in the phone reading order', () => {
  const html = renderToStaticMarkup(
    React.createElement(MemoryRouter, null,
      React.createElement(SprintProvider, null, React.createElement(DailyPage))),
  )

  const focus = html.indexOf('Focus session')
  const shortcuts = html.indexOf('Today shortcuts')
  const weekMap = html.indexOf('Week map')
  const upNext = html.indexOf('Up next')

  assert.ok(focus >= 0 && shortcuts >= 0 && weekMap >= 0 && upNext >= 0)
  assert.ok(focus < shortcuts, 'focus stays first')
  assert.ok(shortcuts < weekMap, 'the week calendar follows shortcuts')
  assert.ok(shortcuts < upNext, 'the upcoming calendar follows shortcuts')
})
