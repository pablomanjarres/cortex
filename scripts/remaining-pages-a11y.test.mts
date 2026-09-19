import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BooksPage } from '../src/features/books/BooksPage.tsx'

// tsx's Node transform uses the classic JSX runtime for imported page files.
Object.assign(globalThis, { React })

test('mobile book details have a keyboard-operable disclosure control', () => {
  const html = renderToStaticMarkup(React.createElement(BooksPage))
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag)
  const disclosure = buttons.find((tag) => tag.includes('aria-label="Details for University of Success"'))

  assert.ok(disclosure, 'University of Success needs a button to open its details')
  assert.match(disclosure, /aria-expanded="false"/)
})
