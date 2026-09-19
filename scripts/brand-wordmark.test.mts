import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('workspace wordmark uses the existing Cortex C icon', async () => {
  const { CortexWordmark } = await import('../src/components/brand/CortexWordmark.tsx')
  const markup = renderToStaticMarkup(createElement(CortexWordmark))

  assert.match(markup, /src="\.\/icons\/icon-192\.png"/)
  assert.match(markup, /alt=""/)
  assert.match(markup, />Cortex</)
  assert.doesNotMatch(markup, />C<\/span>/)
})
