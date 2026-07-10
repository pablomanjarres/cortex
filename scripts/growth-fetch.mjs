#!/usr/bin/env node
// growth-fetch — the deterministic "run" behind the Opportunities → Fastest growing tab.
// Queries the PUBLIC GitHub search API (no Apify, no token required — same lane the radar
// already uses for github) across category buckets, diffs each pull against the last stored
// snapshot to compute true stars/forks GAINED, ranks by momentum, and POSTs the top N back
// to the Cortex store. No LLM — a pure, repeatable process.
//
// Runs three ways, all identical:
//   • weekly launchd timer  (com.pablo.growth-radar.plist)  -> "100 growing projects of the week"
//   • manual:  node scripts/growth-fetch.mjs [--limit 120] [--days 90]
//   • the in-app "Refresh" button also runs the same GitHub scan client-side.
//
// The store is schemaless JSON at key cortex-growth-projects. Env: CORTEX_API
// (default http://localhost:3456), GITHUB_TOKEN (optional, raises rate limit).

const API = process.env.CORTEX_API ?? "http://localhost:3456"
const KEY = "cortex-growth-projects"

const args = process.argv.slice(2)
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def }
const LIMIT = Math.max(10, Number(getArg("--limit", "120")) || 120)
const DAYS = Math.max(7, Number(getArg("--days", "90")) || 90)

const STARS_FLOOR = 10
const MAX_HISTORY = 12

// Specific buckets first so a repo gets a meaningful category before the catch-all.
const CATEGORIES = [
  { key: "ai",       q: "topic:ai",              perPage: 50 },
  { key: "llm",      q: "topic:llm",             perPage: 50 },
  { key: "agents",   q: "topic:agents",          perPage: 50 },
  { key: "devtools", q: "topic:developer-tools", perPage: 50 },
  { key: "web",      q: "topic:frontend",        perPage: 50 },
  { key: "data",     q: "topic:data-science",    perPage: 50 },
  { key: "all",      q: "",                      perPage: 100 }, // broad "hottest overall"
]

const log = (...a) => console.error("[growth]", ...a)

function isoDaysAgo(days) { return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) }

async function ghSearch(q, perPage) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}`
  const headers = { accept: "application/vnd.github+json", "user-agent": "cortex-growth-radar" }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const res = await fetch(url, { headers })
  if (res.status === 403 || res.status === 429) throw new Error("github rate limit")
  if (!res.ok) throw new Error(`github ${res.status}`)
  const body = await res.json()
  return Array.isArray(body.items) ? body.items : []
}

// Read the store, capturing the optimistic-concurrency rev
// (X-Cortex-Rev header; null against servers that don't send it).
async function getStoreWithRev() {
  try {
    const r = await fetch(`${API}/api/data?key=${KEY}`)
    if (!r.ok) return { data: null, rev: null }
    return { data: await r.json(), rev: r.headers.get("x-cortex-rev") }
  } catch { return { data: null, rev: null } }
}

async function postStore(merged, baseRev) {
  return fetch(`${API}/api/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(baseRev != null ? { key: KEY, data: merged, baseRev } : { key: KEY, data: merged }),
  })
}

function mergeSnapshots(prev, found, now) {
  const prevById = new Map((prev?.repos || []).map((r) => [r.id, r]))
  const out = []
  for (const [fn, { it, category }] of found) {
    const stars = Number(it.stargazers_count) || 0
    const forks = Number(it.forks_count) || 0
    const old = prevById.get(fn)
    const history = [...(old?.history || []), { t: now, stars, forks }].slice(-MAX_HISTORY)
    out.push({
      id: fn,
      name: it.name || fn,
      fullName: fn,
      owner: it.owner?.login || fn.split("/")[0] || "",
      url: it.html_url || `https://github.com/${fn}`,
      description: it.description || "",
      language: it.language || null,
      category,
      topics: Array.isArray(it.topics) ? it.topics.slice(0, 12) : [],
      stars,
      forks,
      createdAt: it.created_at || "",
      pushedAt: it.pushed_at || "",
      firstSeen: old?.firstSeen || now,
      lastRefreshed: now,
      starsDelta: old ? stars - old.stars : 0,
      forksDelta: old ? forks - old.forks : 0,
      history,
    })
  }
  // Keep previously-tracked repos not in this scan (preserve their history).
  for (const r of prev?.repos || []) if (!found.has(r.id)) out.push(r)

  // Rank: momentum first (stars gained), then absolute stars. Keeps the top-of-the-week hot.
  out.sort((a, b) => (b.starsDelta - a.starsDelta) || (b.stars - a.stars))
  return out.slice(0, LIMIT)
}

async function main() {
  const since = isoDaysAgo(DAYS)
  log(`scanning github (born since ${since}, top ${LIMIT})…`)
  const found = new Map()
  for (const cat of CATEGORIES) {
    const q = `${cat.q} stars:>${STARS_FLOOR} created:>${since}`.trim()
    let items = []
    try { items = await ghSearch(q, cat.perPage) } catch (e) {
      if (String(e.message).includes("rate limit")) { log("rate limit — stopping early with what we have"); break }
      log(`bucket ${cat.key} failed: ${e.message}`); continue
    }
    log(`  ${cat.key || "all"}: ${items.length}`)
    for (const it of items) {
      const fn = it.full_name
      if (!fn) continue
      const specific = cat.key === "all" ? "other" : cat.key
      const cur = found.get(fn)
      if (!cur) found.set(fn, { it, category: specific })
      else if (cur.category === "other" && specific !== "other") cur.category = specific
    }
  }
  if (found.size === 0) throw new Error("no repos returned from github")

  const now = new Date().toISOString()
  let { data: existing, rev } = await getStoreWithRev()
  existing = existing || {}
  let repos = mergeSnapshots(existing, found, now)
  let merged = { ...existing, repos, lastRefresh: now, runStatus: "done", runFinishedAt: now, runError: undefined }

  let res = await postStore(merged, rev)
  if (res.status === 409) {
    // Someone else wrote between our read and write: re-read, re-merge, retry once.
    log("write conflict — re-reading and re-applying merge")
    ;({ data: existing, rev } = await getStoreWithRev())
    existing = existing || {}
    repos = mergeSnapshots(existing, found, now)
    merged = { ...existing, repos, lastRefresh: now, runStatus: "done", runFinishedAt: now, runError: undefined }
    res = await postStore(merged, rev)
    if (res.status === 409) {
      // Still racing — rev-less last-write-wins (old behavior) so the scan isn't lost.
      log("conflict persists — falling back to last-write-wins")
      res = await postStore(merged, null)
    }
  }
  if (!res.ok) throw new Error(`POST /api/data failed: ${res.status} ${await res.text()}`)
  log(`posted ${repos.length} projects (${found.size} unique scanned) to Cortex.`)
}

main().catch((e) => { console.error("[growth] FATAL:", e.message); process.exit(1) })
