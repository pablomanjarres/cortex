import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HabitsPage } from '../src/features/habits/HabitsPage.tsx'

// tsx's Node transform uses the classic JSX runtime for imported components.
Object.assign(globalThis, { React })

test('every active habit can be archived from both Habits layouts', () => {
  const html = renderToStaticMarkup(React.createElement(HabitsPage))
  const editControls = [...html.matchAll(/aria-label="Edit habit"/g)].length
  const archiveControls = [...html.matchAll(/aria-label="Move habit to on hold"/g)].length

  assert.ok(editControls >= 2, 'desktop and phone habit controls rendered')
  assert.equal(archiveControls, editControls, 'each active habit has an archive action')
  assert.match(html, />On hold</, 'archived habits remain accessible for reactivation')
})
