#!/usr/bin/env node
// radar-ingest — merge classified opportunities into the Cortex `cortex-opportunities`
// store. Deterministic half of the Opportunity Radar routine: the LLM classifies raw
// hits into opportunity records + writes a report; THIS script assigns stable ids,
// dedupes by sourceRef/url against what's already there, MERGES re-sightings of known
// programs (refreshing deadline intel without losing user edits), auto-archives
// long-closed fixed-deadline items, stamps the run, and POSTs the merged set back to
// the running Cortex app (localhost:3456).
//
// Usage:
//   node scripts/radar-ingest.mjs <classified.json> [report.md]
//   node scripts/radar-ingest.mjs --dry <classified.json> [report.md]   # print, don't write
//
// classified.json = an array of partial Opportunity records from the classifier.
// Required per record: title, category, source, sourceRef (or url). Everything else
// is defaulted. Env: CORTEX_API (default http://localhost:3456).
//
// Also importable (scripts/radar-seed-programs.mjs reuses the exact same merge/write
// path): normalizeRecord, mergeClassified, readStoreWithRev, writeMergedWithRetry.

import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { isCalendarDate } from "../src/features/opportunities/expiry.ts"
import { normalizeIntel } from "../src/features/opportunities/opportunity-intel.ts"
import { visibilityPatch } from "../src/features/opportunities/opportunity-score.ts"
import {
  inferSource, stableId, deadlineTypeOf, rollingFromDeadlineType,
  mergeOpportunity, shouldAutoArchive, shouldPrune,
  CATEGORIES, SOURCES, DEADLINE_TYPES, EFFORTS,
} from "./radar-lib.mjs"
import { readKey, writeKey } from "./cortex-store.mjs"

const API = process.env.CORTEX_API ?? "http://localhost:3456"
const KEY = "cortex-opportunities"

const GOALS = new Set(["internship", "exchange", "funding", "social-growth", "users"])
const ELIGIBILITY = new Set(["remote-global", "latam", "us-eu", "other", "unknown"])
const MODALITY = new Set(["remote", "hybrid", "in-person", "unknown"])
const STATUS = new Set(["new", "pursuing", "applied", "won", "lost", "archived"])
const PRIORITY = new Set(["low", "medium", "high"])

function clampScore(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 3
  return Math.max(1, Math.min(5, v))
}

// ── identity-based dedup ─────────────────────────────────────────────────────
// The SAME opportunity shows up across X / Reddit / Devpost / SERP with different post
// URLs, so we key on the OPPORTUNITY (apply-URL + title+host), not the post sourceRef.
export function normUrl(u) {
  if (!u) return ""
  let s = String(u).trim().toLowerCase()
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "")
  s = s.split("#")[0].split("?")[0].replace(/\/+$/, "")
  return s
}
export function normText(s) {
  return String(s || "")
    .toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\b20\d\d\b/g, " ")          // drop years so a recurring program matches across runs
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
}
/** Identity keys for an opportunity; two items collide if they share ANY key. */
function identityKeys(o) {
  const keys = []
  const u = normUrl(o.url)
  if (u && u.length > 6) keys.push("u:" + u)
  // A program's own page identifies it too; a bare domain may host several programs.
  const official = normUrl(o.officialUrl)
  if (official.includes("/") && official !== u) keys.push("u:" + official)
  const t = normText(o.title)
  // Host asides don't change the org ("Z Fellows (Cory Levy)"); title asides can ("Hack (Bogotá)").
  if (t.length >= 4) keys.push("t:" + t + "|" + normText(String(o.host || "").replace(/\([^)]*\)/g, " ")))
  return keys
}
function pick(set, val, fallback) {
  return set.has(val) ? val : fallback
}

/** number | null — accepts numbers and numeric strings ("50000"), rejects the rest. */
function amountOrNull(v) {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}
/** boolean | null — ONLY an explicit boolean survives (an unstated age rule is null). */
function boolOrNull(v) {
  return typeof v === "boolean" ? v : null
}
/** A real calendar date "YYYY-MM-DD" (the first 10 chars), else null. */
function dateOrNull(v) {
  const s = typeof v === "string" ? v.trim().slice(0, 10) : ""
  return isCalendarDate(s) ? s : null
}
/** trimmed string | null */
function strOrNull(v, max = 200) {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s.slice(0, max) : null
}

export function normalizeRecord(raw, runId) {
  const url = typeof raw.url === "string" ? raw.url : ""
  const sourceRef = typeof raw.sourceRef === "string" && raw.sourceRef ? raw.sourceRef : url
  // Deadline intelligence: explicit valid deadlineType wins; legacy records derive it
  // (rolling -> 'rolling', dated -> 'fixed', else 'unknown'). The legacy `rolling`
  // boolean is then re-derived so the two can never disagree.
  const deadline = dateOrNull(raw.deadline)
  const deadlineType = pick(DEADLINE_TYPES, raw.deadlineType, deadlineTypeOf({ ...raw, deadline }))
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
    deadline,
    deadlineType,
    rolling: rollingFromDeadlineType(deadlineType),
    recurrence: strOrNull(raw.recurrence),
    nextWindowExpected: strOrNull(raw.nextWindowExpected),
    amountUsd: amountOrNull(raw.amountUsd),
    requires18Plus: boolOrNull(raw.requires18Plus),
    effort: pick(EFFORTS, raw.effort, null),
    location: String(raw.location ?? ""),
    modality: pick(MODALITY, raw.modality, "unknown"),
    eligibility: pick(ELIGIBILITY, raw.eligibility, "unknown"),
    reward: String(raw.reward ?? ""),
    url,
    officialUrl: typeof raw.officialUrl === "string" ? raw.officialUrl.trim() : "",
    // Trust the platform derived from where the post lives (fixes Devpost hits that the
    // classifier tagged as the generic "web"); fall back to the model's validated source.
    source: raw.source === "catalog" ? "catalog" : inferSource(url, sourceRef, pick(SOURCES, raw.source, "manual")),
    sourceRef,
    discoveredAt: raw.discoveredAt || runId,
    runId,
    notes: String(raw.notes ?? ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 20) : [],
    ...(raw.intel ? { intel: normalizeIntel(raw.intel) } : {}),
    lastVerified: dateOrNull(raw.lastVerified),
    // Window and program dates: exact calendar dates or null, never estimates.
    opensAt: dateOrNull(raw.opensAt),
    programStart: dateOrNull(raw.programStart),
    programEnd: dateOrNull(raw.programEnd),
    evidence: strOrNull(raw.evidence, 1200),
    ...(raw.premium === true ? { premium: true } : {}),
  }
  return rec
}

// Read the existing store, also capturing the optimistic-concurrency rev
// (X-Cortex-Rev header; null against servers that don't send it). A key that does not
// exist yet is an empty radar; a failed read THROWS, so a run never writes a merge built
// from nothing over real data while Cortex is briefly unreachable.
export async function readStoreWithRev(api = API, key = KEY) {
  const { data, rev } = await readKey(api, key)
  if (data && Array.isArray(data.items)) return { existing: data, rev }
  return { existing: { items: [], lastRun: null }, rev }
}

// Pure merge: classified records into the existing store.
//   - identity collision (url or year-stripped title+host) => MERGE, not drop: the
//     incoming sighting refreshes radar-owned fields (deadline intel, links, logistics)
//     while user-owned fields (status/priority/notes/edits) are preserved. This is how
//     "Thiel Fellowship 2027" refreshes the stale 2026 entry instead of vanishing.
//   - fixed-deadline items that closed >7d ago and are still status 'new' auto-archive.
export function mergeClassified(existing, classified, runId, report, today = String(runId).slice(0, 10)) {
  const seen = new Map() // identity key -> index in existingKept

  // pass 1: keep existing, dropping any pre-existing self-duplicates (cleans old dupes)
  const existingKept = []
  let existingDropped = 0
  for (const it of existing.items) {
    const keys = identityKeys(it)
    if (keys.some((k) => seen.has(k))) { existingDropped++; continue }
    keys.forEach((k) => seen.set(k, existingKept.length))
    existingKept.push(it)
  }

  // pass 2: add new classified records; a collision with a kept item REFRESHES it
  const added = []
  let refreshed = 0
  for (const raw of classified) {
    const rec = normalizeRecord(raw, runId)
    const keys = identityKeys(rec)
    if (keys.length === 0) continue
    const hitKey = keys.find((k) => seen.has(k))
    if (hitKey !== undefined) {
      const idx = seen.get(hitKey)
      // idx === -1 → collides with a record ADDED this same run (classifier emitted a
      // duplicate); just skip it. idx >= 0 → re-sighting of a stored item: REFRESH it.
      if (idx >= 0) {
        existingKept[idx] = mergeOpportunity(existingKept[idx], rec, { runId, today })
        refreshed++
      }
      continue
    }
    keys.forEach((k) => seen.set(k, -1)) // -1: marks keys owned by newly-added records
    added.push(rec)
  }

  // pass 3: auto-archive long-closed fixed-deadline items nobody engaged with
  let archived = 0
  const allItems = [...added, ...existingKept].map((it) => {
    if (shouldAutoArchive(it, today)) { archived++; return { ...it, status: "archived" } }
    return it
  })

  const merged = {
    ...existing,
    items: allItems, // new on top, fully deduped
    lastRun: runId,
    lastRunId: runId,
    ...(report !== undefined ? { report } : {}),
  }
  return { merged, added, refreshed, archived, existingDropped }
}

/** Apply the profile's visibility rule to every item. */
export function applyVisibility(store, today) {
  let hidden = 0
  let restored = 0
  const items = store.items.map((o) => {
    const patch = visibilityPatch(o, today)
    if (!patch) return o
    if (patch.status === "archived" && o.status !== "archived") hidden++
    if (patch.status === "new") restored++
    return { ...o, ...patch }
  })
  return { store: { ...store, items }, hidden, restored }
}

/**
 * One research run into the store, shared by the native weekly run and ChatGPT research
 * (MCP add_opportunities): merge re-sightings, re-apply visibility, prune stale junk,
 * write a one-line report (or the caller's report when given).
 */
export function buildStore(existing, records, runId, today, report) {
  const { merged, added, refreshed } = mergeClassified(existing, records, runId, undefined, today)
  const { store, hidden, restored } = applyVisibility(merged, today)
  const items = store.items.filter((o) => !shouldPrune(o, today))
  const kept = items.filter((o) => o.runId === runId && o.status !== "archived").length
  const summary = `${records.length} found · ${kept} kept · ${hidden} hidden${restored ? ` · ${restored} back` : ""}`
  return {
    merged: { ...store, items, report: report || summary },
    added, refreshed, kept, hidden, restored, pruned: store.items.length - items.length,
  }
}

/**
 * Write with optimistic concurrency: post with baseRev; on 409 re-read + re-merge once
 * (via `remerge(freshExisting)`), then fall back to last-write-wins so a full radar run
 * is never thrown away. Returns the final { merged } that was written.
 */
export async function writeMergedWithRetry(api, key, firstMerged, firstRev, remerge) {
  let merged = firstMerged
  let res = await writeKey(api, key, merged, firstRev)
  if (res.status === 409) {
    console.error("radar-ingest: write conflict — re-reading and re-applying merge")
    const { existing, rev } = await readStoreWithRev(api, key)
    merged = remerge(existing).merged
    res = await writeKey(api, key, merged, rev)
    if (res.status === 409) {
      console.error("radar-ingest: conflict persists — falling back to last-write-wins")
      res = await writeKey(api, key, merged, null)
    }
  }
  if (!res.ok) throw new Error(`POST /api/data failed: ${res.status} ${await res.text()}`)
  return { merged }
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes("--dry")
  const positional = args.filter((a) => !a.startsWith("--"))
  const classifiedPath = positional[0]
  const reportPath = positional[1]
  if (!classifiedPath) {
    console.error("usage: node scripts/radar-ingest.mjs [--dry] <classified.json> [report.md]")
    process.exit(2)
  }

  const classified = JSON.parse(await readFile(classifiedPath, "utf8"))
  if (!Array.isArray(classified)) throw new Error("classified.json must be an array")
  const report = reportPath ? await readFile(reportPath, "utf8") : undefined
  const runId = new Date().toISOString()

  const { existing, rev } = await readStoreWithRev(API, KEY)
  const first = mergeClassified(existing, classified, runId, report)
  const { added, refreshed, archived, existingDropped } = first

  console.error(`radar-ingest: ${classified.length} classified, ${added.length} new, ${refreshed} refreshed, ${archived} auto-archived, ${existingDropped} existing dupes removed, ${first.merged.items.length} total`)

  if (dry) {
    console.log(JSON.stringify({ runId, added: added.length, refreshed, archived, existingDropped, total: first.merged.items.length, sample: added.slice(0, 3) }, null, 2))
    return
  }

  const { merged } = await writeMergedWithRetry(API, KEY, first.merged, rev,
    (fresh) => mergeClassified(fresh, classified, runId, report))
  console.error(`radar-ingest: wrote ${merged.items.length} items (${added.length} new, ${refreshed} refreshed, ${archived} auto-archived) to Cortex.`)
}

// Only run as a CLI — importing this module (seed script, tests) must be side-effect-free.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((e) => { console.error("radar-ingest FATAL:", e.message); process.exit(1) })
}
