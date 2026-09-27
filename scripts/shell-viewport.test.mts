import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { DashboardLayout } from '../src/components/layout/DashboardLayout.tsx'

// tsx's Node transform uses the classic JSX runtime for imported components.
Object.assign(globalThis, { React })

function shellMarkup() {
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(DashboardLayout)),
  )
}

test('the page scrolls between the header and the bottom dock', () => {
  const html = shellMarkup()
  const headerEnd = html.indexOf('</header>')
  const mainStart = html.indexOf('<main ')
  const mainEnd = html.indexOf('</main>')
  const navStart = html.indexOf('<nav aria-label="Primary mobile navigation"')

  assert.ok(headerEnd > 0 && headerEnd < mainStart)
  assert.ok(mainStart < mainEnd && mainEnd < navStart)
  assert.match(html, /<main class="[^"]*overflow-y-auto/)
  assert.match(html, /<div class="flex [^"]*h-dvh[^"]*overflow-hidden/)
})

test('mobile navigation is in the shell flow rather than fixed over content', () => {
  const html = shellMarkup()
  const navTag = html.match(/<nav aria-label="Primary mobile navigation"[^>]*>/)?.[0]

  assert.ok(navTag)
  assert.doesNotMatch(navTag, /\bfixed\b/)
})
