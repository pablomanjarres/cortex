#!/usr/bin/env node
// radar-ingest — merge classified opportunities into the Cortex `cortex-opportunities`
// store. Deterministic half of the Opportunity Radar routine: the LLM classifies raw
// hits into opportunity records + writes a report; THIS script assigns stable ids,
// dedupes by sourceRef/url against what's already there, stamps the run, and POSTs
// the merged set back to the running Cortex app (localhost:3456).
//
// Usage:
//   node scripts/radar-ingest.mjs <classified.json> [report.md]
//   node scripts/radar-ingest.mjs --dry <classified.json> [report.md]   # print, don't write
//
// classified.json = an array of partial Opportunity records from the classifier.
// Required per record: title, category, source, sourceRef (or url). Everything else
// is defaulted. Env: CORTEX_API (default http://localhost:3456).

import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"

const API = process.env.CORTEX_API ?? "http://localhost:3456"
const KEY = "cortex-opportunities"

const CATEGORIES = new Set(["hackathon","grant","accelerator","fellowship","internship","exchange","competition","pitch","speaking","scholarship","community","launch","trending","other"])
const GOALS = new Set(["internship","exchange","funding","social-growth","users"])
const ELIGIBILITY = new Set(["remote-global","latam","us-eu","other","unknown"])
const STATUS = new Set(["new","pursuing","applied","won","lost","archived"])
const PRIORITY = new Set(["low","medium","high"])
const SOURCE = new Set(["x","linkedin","reddit","instagram","github","manual"])

const args = process.argv.slice(2)
const dry = args.includes("--dry")
const positional = args.filter((a) => !a.startsWith("--"))
const classifiedPath = positional[0]
const reportPath = positional[1]
if (!classifiedPath) {
  console.error("usage: node scripts/radar-ingest.mjs [--dry] <classified.json> [report.md]")
  process.exit(2)
}

function clampScore(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 3
  return Math.max(1, Math.min(5, v))
}
function pick(set, val, fallback) {
  return set.has(val) ? val : fallback
}
function stableId(o) {
  const key = (o.sourceRef || o.url || o.title || "").trim().toLowerCase()
  return "opp-" + createHash("sha1").update(key).digest("hex").slice(0, 12)
}

function normalizeRecord(raw, runId) {
  const url = typeof raw.url === "string" ? raw.url : ""
  const sourceRef = typeof raw.sourceRef === "string" && raw.sourceRef ? raw.sourceRef : url
  const rec = {
    id: raw.id || stableId({ sourceRef, url, title: raw.title }),
    title: String(raw.title ?? "Untitled opportunity").slice(0, 300),
    host: String(raw.host ?? ""),
    category: pick(CATEGORIES, raw.category, "other"),
    goals: Array.isArray(raw.goals) ? raw.goals.filter((g) => GOALS.has(g)) : [],
    priority: pick(PRIORITY, raw.priority, "medium"),
    leverageScore: clampScore(raw.leverageScore),
    leverageNote: String(raw.leverageNote ?? ""),
    status: pick(STATUS, raw.status, "new"),
    deadline: raw.deadline ? String(raw.deadline).slice(0, 10) : null,
    rolling: Boolean(raw.rolling),
    location: String(raw.location ?? ""),
    eligibility: pick(ELIGIBILITY, raw.eligibility, "unknown"),
    reward: String(raw.reward ?? ""),
    url,
    source: pick(SOURCE, raw.source, "manual"),
    sourceRef,
    discoveredAt: raw.discoveredAt || runId,
    runId,
    notes: String(raw.notes ?? ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 20) : [],
  }
  return rec
}

async function main() {
  const classified = JSON.parse(await readFile(classifiedPath, "utf8"))
  if (!Array.isArray(classified)) throw new Error("classified.json must be an array")
  const report = reportPath ? await readFile(reportPath, "utf8") : undefined
  const runId = new Date().toISOString()

  // existing store
  let existing = { items: [], lastRun: null }
  try {
    const res = await fetch(`${API}/api/data?key=${KEY}`)
    if (res.ok) {
      const body = await res.json()
      if (body && Array.isArray(body.items)) existing = body
    }
  } catch (e) {
    console.error("warn: could not read existing store:", e.message)
  }

  const seen = new Set()
  for (const it of existing.items) {
    if (it.sourceRef) seen.add(it.sourceRef.trim().toLowerCase())
    if (it.url) seen.add(it.url.trim().toLowerCase())
  }

  const added = []
  for (const raw of classified) {
    const rec = normalizeRecord(raw, runId)
    const refKey = (rec.sourceRef || rec.url || "").trim().toLowerCase()
    if (refKey && seen.has(refKey)) continue // already tracked — skip
    if (refKey) seen.add(refKey)
    added.push(rec)
  }

  const merged = {
    ...existing,
    items: [...added, ...existing.items],
    lastRun: runId,
    lastRunId: runId,
    ...(report !== undefined ? { report } : {}),
  }

  console.error(`radar-ingest: ${classified.length} classified, ${added.length} new (deduped), ${merged.items.length} total`)

  if (dry) {
    console.log(JSON.stringify({ runId, added: added.length, total: merged.items.length, sample: added.slice(0, 3) }, null, 2))
    return
  }

  const res = await fetch(`${API}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: KEY, data: merged }),
  })
  if (!res.ok) throw new Error(`POST /api/data failed: ${res.status} ${await res.text()}`)
  console.error(`radar-ingest: wrote ${merged.items.length} items (${added.length} new) to Cortex.`)
}

main().catch((e) => { console.error("radar-ingest FATAL:", e.message); process.exit(1) })
