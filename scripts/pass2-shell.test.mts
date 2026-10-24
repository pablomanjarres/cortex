import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CloudCostSourceStatus } from '../electron/cloud-cost-types.ts'
import { DEFAULT_CLOUD_COST_SETTINGS, cloudSourceId, cloudSourceState } from '../src/features/cloud-costs/cloud-cost-store.ts'
import { founderSourceHealth } from '../src/features/founder/founder-status.ts'
import { SegmentedControl } from '../src/components/shared/SegmentedControl.tsx'
import { SetupState, SetupStatusRow } from '../src/components/shared/SetupState.tsx'

// tsx's Node transform uses the classic JSX runtime for imported components.
Object.assign(globalThis, { React })

const status = (patch: Partial<CloudCostSourceStatus>): CloudCostSourceStatus => ({
  configured: true, ok: false, sourceId: null, fetchedAt: null, attemptedAt: null, error: null, ...patch,
})

test('a cloud source is live only for a successful snapshot from the configured source', () => {
  const settings = { ...DEFAULT_CLOUD_COST_SETTINGS, awsProfile: '   ', gcpBillingTable: ' billing.table ' }
  assert.equal(cloudSourceId(settings, 'aws'), '')
  assert.equal(cloudSourceState(cloudSourceId(settings, 'aws'), status({ ok: true, sourceId: '' })), 'off')

  const gcp = cloudSourceId(settings, 'gcp')
  assert.equal(cloudSourceState(gcp, status({ ok: true, sourceId: 'billing.table' })), 'live')
  assert.equal(cloudSourceState(gcp, status({ ok: true, sourceId: 'previous.table' })), 'stale')
  assert.equal(cloudSourceState(gcp, status({ ok: false, sourceId: 'billing.table', error: 'denied' })), 'stale')
})

test('founder sources wait until a configured refresh has actually failed', () => {
  const base = { configured: true, ok: false, fetchedAt: null, consecutiveFailures: 0 }
  assert.equal(founderSourceHealth({ ...base, configured: false, consecutiveFailures: 3 }), 'unconfigured')
  assert.equal(founderSourceHealth({ ...base, ok: true, consecutiveFailures: 2 }), 'live')
  assert.equal(founderSourceHealth(base), 'waiting')
  assert.equal(founderSourceHealth({ ...base, consecutiveFailures: 1 }), 'failing')
})

test('a segmented control names its group and reports only the selected segment as pressed', () => {
  const html = renderToStaticMarkup(React.createElement(SegmentedControl, {
    label: 'Editor mode',
    value: 'preview',
    onChange: () => undefined,
    options: [
      { value: 'write', label: React.createElement('svg'), ariaLabel: 'Write' },
      { value: 'preview', label: React.createElement('svg'), ariaLabel: 'Preview' },
    ],
  }))
  assert.match(html, /role="group" aria-label="Editor mode"/)
  const buttons = html.match(/<button[^>]*>/g) ?? []
  assert.equal(buttons.length, 2)
  assert.match(buttons[0], /aria-pressed="false"/)
  assert.match(buttons[0], /aria-label="Write"/)
  assert.match(buttons[1], /aria-pressed="true"/)
  assert.match(buttons[1], /aria-label="Preview"/)
})

test('the setup panel is labelled by its own heading', () => {
  const html = renderToStaticMarkup(React.createElement(SetupState, {
    icon: null,
    title: 'Connect your cloud costs',
    description: 'Set up a source.',
    statusTitle: 'Billing sources',
    children: React.createElement(SetupStatusRow, { label: 'AWS Cost Explorer', children: 'Off' }),
  }))
  const labelledBy = html.match(/<section[^>]*aria-labelledby="([^"]+)"/)?.[1]
  assert.ok(labelledBy)
  assert.ok(html.includes(`<h2 id="${labelledBy}"`))
  assert.match(html, /<h2[^>]*>Connect your cloud costs<\/h2>/)
})
