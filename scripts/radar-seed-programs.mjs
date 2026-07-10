#!/usr/bin/env node
// radar-seed-programs — seed the Opportunity Radar with the curated program catalog
// (scripts/program-catalog.json: 30 web-verified fellowships / grants / accelerators /
// programs). Maps each catalog entry to a full Opportunity record and merges it into
// the cortex-opportunities store via the EXACT same dedupe/merge/ingest path the weekly
// radar uses (radar-ingest.mjs) — so re-running refreshes deadline intel on existing
// entries instead of duplicating them, and user edits survive.
//
// Usage:
//   node scripts/radar-seed-programs.mjs            # DRY RUN (default): print table, NO network
//   node scripts/radar-seed-programs.mjs --write    # merge + POST to CORTEX_API (default localhost:3456)
//
// Env: CORTEX_API (default http://localhost:3456) — only read in --write mode.

import { readFile } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import { dirname, join } from "node:path"
import { stableId, deadlineTypeOf, rollingFromDeadlineType, DEADLINE_TYPES, CATEGORIES, EFFORTS } from "./radar-lib.mjs"
import { mergeClassified, readStoreWithRev, writeMergedWithRetry } from "./radar-ingest.mjs"

const KEY = "cortex-opportunities"

// Goals inferred from category: money programs advance "funding"; competition-style
// entries are visibility/user plays; scholarships here are mobility programs (exchange).
const GOALS_BY_CATEGORY = {
  grant: ["funding"],
  fellowship: ["funding"],
  accelerator: ["funding"],
  program: ["funding"],
  residency: ["funding"],
  research: ["funding"],
  competition: ["users", "social-growth"],
  hackathon: ["users", "social-growth"],
  pitch: ["funding", "users"],
  scholarship: ["exchange"],
  exchange: ["exchange"],
  internship: ["internship"],
}

/** One catalog entry -> one Opportunity-shaped record (pre-normalizeRecord). Exported
 *  so radar-lib.test.mjs can pin the mapping. */
export function mapCatalogEntry(entry, nowIso) {
  const e = entry || {}
  const url = String(e.url ?? "")
  const deadline = e.deadline ? String(e.deadline).slice(0, 10) : null
  const deadlineType = DEADLINE_TYPES.has(e.deadlineType)
    ? e.deadlineType
    : deadlineTypeOf({ deadline, rolling: false })
  const category = CATEGORIES.has(e.category) ? e.category : "other"
  return {
    id: stableId({ url }), // 'opp-' + sha1(url) — same helper the ingest uses
    title: String(e.title ?? ""),
    host: String(e.host ?? ""),
    category,
    goals: GOALS_BY_CATEGORY[category] ?? ["funding"],
    priority: e.priority === "high" || e.priority === "low" ? e.priority : "medium",
    leverageScore: e.leverageScore,
    leverageNote: String(e.fitNotes ?? ""),
    status: "new",
    deadline,
    deadlineType,
    rolling: rollingFromDeadlineType(deadlineType),
    recurrence: e.recurrence ?? null,
    nextWindowExpected: e.nextWindowExpected ?? null,
    amountUsd: Number.isFinite(e.amountUsd) ? e.amountUsd : null,
    requires18Plus: typeof e.requires18Plus === "boolean" ? e.requires18Plus : null,
    effort: EFFORTS.has(e.effort) ? e.effort : null,
    location: String(e.location ?? ""),
    modality: e.modality ?? "unknown",
    eligibility: e.eligibility ?? "unknown",
    reward: String(e.reward ?? ""),
    url,
    officialUrl: url, // catalog entries ARE the canonical program pages
    source: "catalog",
    sourceRef: url,
    discoveredAt: nowIso,
    notes: String(e.eligibilityNotes ?? ""),
    tags: ["program-catalog"],
  }
}

async function loadCatalog() {
  const here = dirname(fileURLToPath(import.meta.url))
  const raw = JSON.parse(await readFile(join(here, "program-catalog.json"), "utf8"))
  if (!Array.isArray(raw)) throw new Error("program-catalog.json must be an array")
  return raw
}

function printTable(records) {
  const pad = (s, n) => String(s ?? "").slice(0, n).padEnd(n)
  console.log(pad("TITLE", 38) + pad("CATEGORY", 12) + pad("DEADLINE", 12) + pad("TYPE", 12) + pad("USD", 10) + pad("18+", 5) + "ID")
  console.log("-".repeat(103))
  for (const r of records) {
    const amount = r.amountUsd != null ? `$${r.amountUsd >= 1000 ? Math.round(r.amountUsd / 1000) + "k" : r.amountUsd}` : "—"
    const age = r.requires18Plus === true ? "18+" : r.requires18Plus === false ? "no" : "?"
    console.log(pad(r.title, 38) + pad(r.category, 12) + pad(r.deadline ?? "—", 12) + pad(r.deadlineType, 12) + pad(amount, 10) + pad(age, 5) + r.id)
  }
}

async function main() {
  const write = process.argv.includes("--write")
  const nowIso = new Date().toISOString()
  const catalog = await loadCatalog()
  const records = catalog.map((e) => mapCatalogEntry(e, nowIso))

  const bad = records.filter((r) => !r.title || !r.url)
  if (bad.length) throw new Error(`catalog entries missing title/url: ${bad.length}`)

  printTable(records)
  console.error(`\nradar-seed-programs: mapped ${records.length} catalog entries.`)

  if (!write) {
    console.error("DRY RUN (no network). Re-run with --write to merge into the live store.")
    return
  }

  // --write: same read → merge (dedupe/refresh/auto-archive) → rev-checked POST path
  // as radar-ingest. Report intentionally untouched (undefined).
  const API = process.env.CORTEX_API ?? "http://localhost:3456"
  const { existing, rev } = await readStoreWithRev(API, KEY)
  const first = mergeClassified(existing, records, nowIso, undefined)
  console.error(`radar-seed-programs: ${first.added.length} new, ${first.refreshed} refreshed, ${first.archived} auto-archived, ${first.merged.items.length} total`)
  await writeMergedWithRetry(API, KEY, first.merged, rev, (fresh) => mergeClassified(fresh, records, nowIso, undefined))
  console.error(`radar-seed-programs: wrote ${first.merged.items.length} items to Cortex.`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((e) => { console.error("radar-seed-programs FATAL:", e.message); process.exit(1) })
}
