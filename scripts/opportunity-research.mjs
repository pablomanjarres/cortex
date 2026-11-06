#!/usr/bin/env node
// opportunity-research — the weekly Opportunity Radar. One Codex deep-research call finds
// and re-verifies opportunities for the profile in scripts/radar-profile.md. This script
// then validates every field, scores it with the profile rules
// (src/features/opportunities/opportunity-score.ts), hides whatever fails, and merges the
// rest into the Cortex store (localhost:3456).
//
// SAFETY: Codex reads the open web, a prompt-injection surface. It runs without user
// config, rules, hooks, MCP servers, plugins, the shell or the browser, in a read-only
// sandbox with an empty working dir. Web search is its only tool and schema-checked JSON
// is its only output. Every write happens here, after validation.
//
// Usage:
//   node scripts/opportunity-research.mjs           research, then write to Cortex
//   node scripts/opportunity-research.mjs --dry     research, print the result, write nothing
//   node scripts/opportunity-research.mjs --from <file>   ingest a saved Codex answer
// Env: CORTEX_API (default http://localhost:3456), RADAR_CODEX_MODEL (gpt-5.6-sol),
//      RADAR_CODEX_EFFORT (high). The last raw answer is kept at
//      ~/Library/Logs/opportunity-research-last.json for --from re-runs.

import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { normalizeIntel } from "../src/features/opportunities/opportunity-intel.ts"
import { scoreOpportunity, visibilityPatch } from "../src/features/opportunities/opportunity-score.ts"
import { mergeClassified, readStoreWithRev, writeMergedWithRetry } from "./radar-ingest.mjs"
import { shouldPrune } from "./radar-lib.mjs"
import { buildResearchPrompt, researchSchema } from "./research-prompt.mjs"

const API = process.env.CORTEX_API ?? "http://localhost:3456"
const KEY = "cortex-opportunities"
const MODEL = process.env.RADAR_CODEX_MODEL ?? "gpt-5.6-sol"
const EFFORT = process.env.RADAR_CODEX_EFFORT ?? "high"
const CODEX_TIMEOUT_MS = 50 * 60 * 1000
const MAX_TRACKED = 30
const MAX_REJECTED = 60
const LAST_ANSWER = join(homedir(), "Library/Logs/opportunity-research-last.json")
const DISABLED_FEATURES = [
  "shell_tool", "unified_exec", "browser_use", "computer_use", "apps", "plugins",
  "memories", "multi_agent", "hooks", "image_generation",
]

const here = dirname(fileURLToPath(import.meta.url))

/** Bogotá calendar day, YYYY-MM-DD. */
export const bogotaToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "America/Bogota" })

/** Focus notes from chat steer a month of runs, then lapse. */
const FOCUS_MAX_AGE_DAYS = 30
const daysOld = (iso, today) => (Date.parse(`${today}T00:00:00Z`) - Date.parse(iso)) / 86_400_000

/**
 * What the brief re-verifies and what it should skip. Re-verify: items he is pursuing or
 * applied to, live items that pass (best first), then the curated catalog, which has no
 * research facts until a run fills them in.
 */
export function researchInputs(store, today) {
  const items = Array.isArray(store?.items) ? store.items : []
  const live = items
    .filter((o) => o.status === "pursuing" || o.status === "applied" || (o.status === "new" && scoreOpportunity(o, today).keep))
    .sort((a, b) => scoreOpportunity(b, today).score - scoreOpportunity(a, today).score)
  const catalog = items.filter((o) => o.source === "catalog" && !live.includes(o) && (o.status === "new" || o.hiddenReason))
  const tracked = [...live, ...catalog]
    .slice(0, MAX_TRACKED)
    .map((o) => `${o.title} — ${o.officialUrl || o.url}`)
  const rejected = items
    .filter((o) => o.hiddenReason && o.source !== "catalog")
    .slice(0, MAX_REJECTED)
    .map((o) => o.title)
  const focus = (store?.objectives ?? [])
    .filter((o) => o && o.active && typeof o.text === "string" && daysOld(o.createdAt, today) <= FOCUS_MAX_AGE_DAYS)
    .map((o) => o.text.slice(0, 300))
  return { tracked, rejected, focus }
}

/** One Codex answer item -> a classified record radar-ingest can normalize. */
export function toRecord(raw, today) {
  const intel = normalizeIntel(raw?.intel)
  const url = typeof raw?.url === "string" ? raw.url.trim() : ""
  const officialUrl = typeof raw?.officialUrl === "string" ? raw.officialUrl.trim() : ""
  return {
    title: raw?.title,
    host: raw?.host,
    category: raw?.category,
    url: url || officialUrl,
    officialUrl,
    location: raw?.location,
    modality: raw?.modality,
    eligibility: intel.colombiaAllowed === true ? "remote-global" : "unknown",
    deadline: raw?.deadline,
    deadlineType: raw?.deadlineType,
    nextWindowExpected: raw?.nextWindowExpected,
    amountUsd: raw?.amountUsd,
    reward: raw?.reward,
    effort: raw?.effort,
    requires18Plus: intel.ageMin != null ? intel.ageMin >= 18 : null,
    leverageNote: typeof raw?.why === "string" ? raw.why.slice(0, 200) : "",
    notes: typeof raw?.evidence === "string" ? raw.evidence.slice(0, 600) : "",
    source: "web",
    sourceRef: officialUrl || url,
    intel,
    lastVerified: today,
  }
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

/** Merge this run's records, re-apply visibility, prune stale junk, write a one-line report. */
export function buildStore(existing, records, runId, today) {
  const { merged } = mergeClassified(existing, records, runId, undefined)
  const { store, hidden, restored } = applyVisibility(merged, today)
  const items = store.items.filter((o) => !shouldPrune(o, today))
  const kept = items.filter((o) => o.runId === runId && o.status !== "archived").length
  const report = `${records.length} found · ${kept} kept · ${hidden} hidden${restored ? ` · ${restored} back` : ""}`
  return { merged: { ...store, items, report }, kept, hidden, restored, pruned: store.items.length - items.length }
}

function runCodex(prompt, schemaPath, outPath, cwd) {
  const args = [
    "exec", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules",
    "-s", "read-only", "-m", MODEL,
    "-c", "web_search=live", "-c", `model_reasoning_effort=${EFFORT}`,
    ...DISABLED_FEATURES.flatMap((f) => ["--disable", f]),
    "-C", cwd, "--output-schema", schemaPath, "-o", outPath, "-",
  ]
  return new Promise((resolve, reject) => {
    const child = spawn("codex", args, { cwd, stdio: ["pipe", "pipe", "pipe"] })
    let tail = ""
    const keepTail = (chunk) => { tail = (tail + chunk).slice(-2000) }
    child.stdout.on("data", keepTail)
    child.stderr.on("data", keepTail)
    const timer = setTimeout(() => child.kill("SIGKILL"), CODEX_TIMEOUT_MS)
    child.on("error", (e) => { clearTimeout(timer); reject(e) })
    child.on("exit", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`codex exited ${code}: ${tail.split("\n").filter((l) => /error/i.test(l)).slice(-2).join(" | ").slice(0, 300)}`))
    })
    child.stdin.end(prompt)
  })
}

async function research(store, today) {
  const profile = await readFile(join(here, "radar-profile.md"), "utf8")
  const prompt = buildResearchPrompt({ profile, today, ...researchInputs(store, today) })
  const dir = await mkdtemp(join(tmpdir(), "radar-research-"))
  try {
    const schemaPath = join(dir, "schema.json")
    const outPath = join(dir, "answer.json")
    await writeFile(schemaPath, JSON.stringify(researchSchema()))
    await runCodex(prompt, schemaPath, outPath, dir)
    const answer = await readFile(outPath, "utf8")
    await writeFile(LAST_ANSWER, answer).catch(() => {})
    return JSON.parse(answer)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes("--dry")
  const fromIdx = args.indexOf("--from")
  const today = bogotaToday()
  const runId = new Date().toISOString()

  const { existing, rev } = await readStoreWithRev(API, KEY)
  const answer = fromIdx >= 0
    ? JSON.parse(await readFile(args[fromIdx + 1], "utf8"))
    : await research(existing, today)
  const found = Array.isArray(answer?.opportunities) ? answer.opportunities : []
  const records = found.map((raw) => toRecord(raw, today))

  const first = buildStore(existing, records, runId, today)
  console.error(`opportunity-research: ${first.merged.report}`)
  if (dry) {
    const live = first.merged.items.filter((o) => o.status === "new" || o.status === "pursuing" || o.status === "applied")
    const rows = live.map((o) => [scoreOpportunity(o, today).score, o.title]).sort((a, b) => b[0] - a[0])
    console.log(rows.map(([s, t]) => `${String(s).padStart(3)}  ${t}`).join("\n"))
    return
  }
  await writeMergedWithRetry(API, KEY, first.merged, rev, (fresh) => buildStore(fresh, records, runId, today))
  console.error("opportunity-research: written to Cortex")
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((e) => { console.error("opportunity-research FATAL:", e.message); process.exit(1) })
}
