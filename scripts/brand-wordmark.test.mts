import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('workspace uses the Human Rhythm wordmark with an accessible brand name', async () => {
  const { CortexWordmark } = await import('../src/components/brand/CortexWordmark.tsx')
  const markup = renderToStaticMarkup(createElement(CortexWordmark))

  assert.match(markup, /role="img"/)
  assert.match(markup, /aria-label="Cortex"/)
  assert.match(markup, /\.\/brand\/wordmark\.svg/)
  assert.match(markup, /\.\/brand\/mark\.svg/)
  assert.match(markup, /bg-sidebar-primary/)
  assert.doesNotMatch(markup, /icon-192\.png|>Cortex</)
})
