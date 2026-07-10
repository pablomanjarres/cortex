#!/usr/bin/env node
// radar-control-watcher — always-on (launchd KeepAlive) daemon that lets the "Run radar"
// button in the Cortex Opportunities page trigger the pipeline. It polls the store; when
// the button sets runStatus:"requested", it runs opportunity-radar-weekly.sh and reflects
// progress back into the store (running → done/error). Fully decoupled from the Electron
// main process, so it needs no app code change.

import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { processPendingObjectives } from "./radar-objectives.mjs"

const API = process.env.CORTEX_API ?? "http://localhost:3456"
const KEY = "cortex-opportunities"
const WRAPPER = "/Users/pablo/projects/cortex/scripts/opportunity-radar-weekly.sh"
const LOG = `${process.env.HOME}/Library/Logs/opportunity-radar.log`
const POLL_MS = 5000
const RUN_TIMEOUT_MS = 40 * 60 * 1000
const STALE_MS = 45 * 60 * 1000

let busy = false

// Read a store key, capturing the optimistic-concurrency rev
// (X-Cortex-Rev header; null against servers that don't send it).
async function getStoreWithRev(key) {
  try {
    const r = await fetch(`${API}/api/data?key=${key}`)
    if (!r.ok) return { data: null, rev: null }
    return { data: await r.json(), rev: r.headers.get("x-cortex-rev") }
  } catch { return { data: null, rev: null } }
}

async function getStore() {
  return (await getStoreWithRev(KEY)).data
}

// Read → merge fields → write with baseRev. On 409 (someone else wrote in
// between) re-read and retry once; if it STILL conflicts, fall back to a
// rev-less last-write-wins post — these are control-flow flags (runStatus)
// that must land or the UI wedges.
async function postPatch(key, fallbackObj, fields) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, rev } = await getStoreWithRev(key)
    const cur = data ?? fallbackObj
    const res = await fetch(`${API}/api/data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rev != null
        ? { key, data: { ...cur, ...fields }, baseRev: rev }
        : { key, data: { ...cur, ...fields } }),
    })
    if (res.status !== 409) return
  }
  const { data } = await getStoreWithRev(key)
  await fetch(`${API}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, data: { ...(data ?? fallbackObj), ...fields } }),
  })
}

async function patch(fields) {
  await postPatch(KEY, { items: [], lastRun: null }, fields)
}

function runPipeline() {
  return new Promise((resolve) => {
    const child = spawn("bash", [WRAPPER], { stdio: "ignore" })
    const timer = setTimeout(() => { try { child.kill("SIGKILL") } catch {} }, RUN_TIMEOUT_MS)
    child.on("exit", (code) => { clearTimeout(timer); resolve(code ?? 1) })
    child.on("error", () => { clearTimeout(timer); resolve(1) })
  })
}

async function logTail() {
  try {
    const lines = (await readFile(LOG, "utf8")).split("\n").filter(Boolean)
    return lines.slice(-3).join(" | ").slice(-220)
  } catch { return "" }
}

async function tick() {
  if (busy) return
  const store = await getStore()
  if (!store) return

  // crash recovery: a 'running' left stale means a previous watcher died mid-run.
  if (store.runStatus === "running" && store.runStartedAt &&
      Date.now() - new Date(store.runStartedAt).getTime() > STALE_MS) {
    await patch({ runStatus: "error", runError: "run interrupted (watcher restarted)", runFinishedAt: new Date().toISOString() })
    return
  }
  if (store.runStatus !== "requested") return

  busy = true
  try {
    await patch({ runStatus: "running", runStartedAt: new Date().toISOString(), runError: undefined })
    const code = await runPipeline()
    if (code === 0) {
      await patch({ runStatus: "done", runFinishedAt: new Date().toISOString() })
    } else {
      await patch({ runStatus: "error", runError: `exit ${code}: ${await logTail()}`, runFinishedAt: new Date().toISOString() })
    }
  } catch (e) {
    await patch({ runStatus: "error", runError: String(e?.message ?? e), runFinishedAt: new Date().toISOString() })
  } finally {
    busy = false
  }
}

// Hunt orders ("talk to radar"): read plain-language objectives the user typed and let a
// tool-less Claude call reply + structure them. Guarded independently of the run `busy`
// flag so a slow model response never delays run detection.
let objBusy = false
async function objTick() {
  if (objBusy) return
  objBusy = true
  try { await processPendingObjectives(API, KEY) } catch { /* ignore */ }
  finally { objBusy = false }
}

// Fastest-growing-projects run: the UI "Run" button (and the weekly launchd timer) drive a
// deterministic GitHub scan via growth-fetch.mjs. Same requested→running→done/error contract
// as the radar run, on its own store key + guard.
const GROWTH_KEY = "cortex-growth-projects"
const GROWTH_SCRIPT = "/Users/pablo/projects/cortex/scripts/growth-fetch.mjs"

async function getGrowth() {
  return (await getStoreWithRev(GROWTH_KEY)).data
}
async function patchGrowth(fields) {
  await postPatch(GROWTH_KEY, { repos: [], lastRefresh: null }, fields)
}
function runGrowth() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [GROWTH_SCRIPT, "--limit", "120"], { stdio: "ignore" })
    const timer = setTimeout(() => { try { child.kill("SIGKILL") } catch {} }, RUN_TIMEOUT_MS)
    child.on("exit", (code) => { clearTimeout(timer); resolve(code ?? 1) })
    child.on("error", () => { clearTimeout(timer); resolve(1) })
  })
}
let growthBusy = false
async function growthTick() {
  if (growthBusy) return
  const store = await getGrowth()
  if (!store) return
  if (store.runStatus === "running" && store.runStartedAt &&
      Date.now() - new Date(store.runStartedAt).getTime() > STALE_MS) {
    await patchGrowth({ runStatus: "error", runError: "run interrupted (watcher restarted)", runFinishedAt: new Date().toISOString() })
    return
  }
  if (store.runStatus !== "requested") return
  growthBusy = true
  try {
    await patchGrowth({ runStatus: "running", runStartedAt: new Date().toISOString(), runError: undefined })
    const code = await runGrowth()
    if (code === 0) await patchGrowth({ runStatus: "done", runFinishedAt: new Date().toISOString() })
    else await patchGrowth({ runStatus: "error", runError: `growth-fetch exit ${code}`, runFinishedAt: new Date().toISOString() })
  } catch (e) {
    await patchGrowth({ runStatus: "error", runError: String(e?.message ?? e), runFinishedAt: new Date().toISOString() })
  } finally {
    growthBusy = false
  }
}

console.error(`[radar-control] watching ${API} every ${POLL_MS}ms`)
setInterval(() => { tick().catch(() => {}) }, POLL_MS)
setInterval(() => { objTick().catch(() => {}) }, POLL_MS)
setInterval(() => { growthTick().catch(() => {}) }, POLL_MS)
tick().catch(() => {})
objTick().catch(() => {})
growthTick().catch(() => {})
