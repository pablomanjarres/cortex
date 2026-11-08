#!/usr/bin/env node
// opportunity-alerts — the I/O half of the opportunity alert queue. The rules live in
// src/features/opportunities/opportunity-alerts.ts (pure); this module reads the radar,
// the travel-readiness rule and the alert store from the Cortex app, and writes the alert
// store back with rev-checked retries. Used by the weekly research run, by the MCP
// server (add_opportunities, get_opportunity_alerts, ack_opportunity_alerts) and as a CLI.
//
// Delivery is pull-based: nothing is "sent" until a reader (Kaiser's scheduled check)
// acknowledges it. Unacknowledged alerts stay pending, so an offline Mac or a failed
// post only delays delivery.
//
// Usage:
//   node scripts/opportunity-alerts.mjs check              reconcile now (baseline on first run)
//   node scripts/opportunity-alerts.mjs pending [mode]      print what a check would send (auto|urgent|all)
//   node scripts/opportunity-alerts.mjs ack <id...>         mark alerts delivered
// Env: CORTEX_API (default http://localhost:3456).

import { pathToFileURL } from "node:url"
import {
  ALERTS_KEY, ackAlerts, normalizeAlertStore, reconcileAlerts, selectDelivery,
} from "../src/features/opportunities/opportunity-alerts.ts"
import {
  DEFAULT_TRAVEL_READINESS, TRAVEL_READINESS_KEY, readinessOf,
} from "../src/features/opportunities/travel-readiness.ts"
import { mutateKey, readKey } from "./cortex-store.mjs"
import { bogotaToday } from "./radar-lib.mjs"

const API = process.env.CORTEX_API ?? "http://localhost:3456"
const OPP_KEY = "cortex-opportunities"

/** Stored readiness, or the default rule (US visa pending until 2027-05-01) when unset. */
export async function getTravelReadiness({ api = API } = {}) {
  const { data } = await readKey(api, TRAVEL_READINESS_KEY)
  return { readiness: data ? readinessOf(data) : DEFAULT_TRAVEL_READINESS, stored: data != null }
}

/** Upsert one country rule. Only explicit fields change. */
export async function setTravelReadiness({ api = API, country, visa, blockedBefore, note, now = new Date().toISOString() }) {
  return mutateKey(api, TRAVEL_READINESS_KEY, (current) => {
    const r = current ? readinessOf(current) : DEFAULT_TRAVEL_READINESS
    const code = String(country || "").toUpperCase()
    const old = r.rules.find((x) => x.country === code) ?? { country: code, visa: "pending", blockedBefore: null }
    const rule = {
      ...old,
      ...(visa !== undefined ? { visa } : {}),
      ...(blockedBefore !== undefined ? { blockedBefore } : {}),
      ...(note !== undefined ? { note } : {}),
    }
    const value = readinessOf({ updatedAt: now, rules: [...r.rules.filter((x) => x.country !== code), rule] })
    return { value, result: value }
  })
}

/**
 * Compare the radar with the last state the alert store saw and queue new alerts.
 * The first call baselines silently. Safe to run any number of times.
 */
export async function reconcileOpportunityAlerts({ api = API, runId = null, now = new Date().toISOString(), today = bogotaToday(new Date(now)) } = {}) {
  const [{ data: opp }, { readiness }] = await Promise.all([readKey(api, OPP_KEY), getTravelReadiness({ api })])
  const items = Array.isArray(opp?.items) ? opp.items : []
  return mutateKey(api, ALERTS_KEY, (current) => {
    const r = reconcileAlerts({ store: current, items, readiness, today, now, runId })
    const pending = r.store.alerts.filter((a) => a.state === "pending").length
    return {
      value: r.store,
      result: { baseline: r.baseline, created: r.created.length, createdAlerts: r.created, expired: r.expired, pending, tracked: items.length, store: r.store },
    }
  })
}

/** Reconcile (so time-based alerts like "deadline in 3 days" appear), then select what to send. */
export async function readAlertDelivery({ api = API, mode = "auto", max, now = new Date().toISOString() } = {}) {
  const check = await reconcileOpportunityAlerts({ api, now })
  const delivery = selectDelivery(check.store, now, mode, max)
  return { ...delivery, check: { baseline: check.baseline, created: check.created, expired: check.expired, pending: check.pending } }
}

export async function ackOpportunityAlerts({ api = API, ids, delivered = true, channel = "kaiser", note, now = new Date().toISOString() }) {
  return mutateKey(api, ALERTS_KEY, (current) => {
    const r = ackAlerts(current, { ids, delivered, channel, note, now })
    const { store, ...result } = r
    const changed = result.acked.length + result.failed.length > 0
    return changed ? { value: store, result } : { result }
  })
}

/** Pending alerts as stored (no reconcile), for tools that only inspect. */
export async function listAlerts({ api = API, state } = {}) {
  const { data } = await readKey(api, ALERTS_KEY)
  const s = normalizeAlertStore(data)
  return { ...s, alerts: state ? s.alerts.filter((a) => a.state === state) : s.alerts }
}

async function main() {
  const [cmd = "check", ...rest] = process.argv.slice(2)
  if (cmd === "check") {
    const r = await reconcileOpportunityAlerts({})
    const summary = { ...r }
    delete summary.store
    console.log(JSON.stringify({ ...summary, createdAlerts: r.createdAlerts.map((a) => a.card.headline) }, null, 2))
  } else if (cmd === "pending") {
    const r = await readAlertDelivery({ mode: rest[0] || "auto" })
    console.log(r.message)
    console.error(`\n${r.alertIds.length} alert ids: ${r.alertIds.join(" ")}`)
  } else if (cmd === "ack") {
    console.log(JSON.stringify(await ackOpportunityAlerts({ ids: rest, channel: "cli" }), null, 2))
  } else {
    console.error("usage: node scripts/opportunity-alerts.mjs check | pending [auto|urgent|all] | ack <id...>")
    process.exit(2)
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((e) => { console.error("opportunity-alerts FATAL:", e.message); process.exit(1) })
}
