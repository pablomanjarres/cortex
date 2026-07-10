// node --test scripts/radar-lib.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  inferSource, hostOf, deburr, selectHits,
  deadlineTypeOf, rollingFromDeadlineType, mergeOpportunity, shouldAutoArchive,
  addDays, stableId,
} from "./radar-lib.mjs"
import { mergeClassified, normalizeRecord } from "./radar-ingest.mjs"
import { mapCatalogEntry } from "./radar-seed-programs.mjs"

test("deburr strips accents + lowercases", () => {
  assert.equal(deburr("Medellín"), "medellin")
  assert.equal(deburr("BOGOTÁ"), "bogota")
})

test("hostOf handles urls, subdomains, bare hosts", () => {
  assert.equal(hostOf("https://www.devpost.com/x"), "devpost.com")
  assert.equal(hostOf("https://foo.devpost.com/y"), "foo.devpost.com")
  assert.equal(hostOf("x.com/pablo/status/1"), "x.com")
  assert.equal(hostOf(""), "")
})

test("inferSource maps Devpost (incl. subdomains) that used to read as web", () => {
  assert.equal(inferSource("https://baskchallenge.devpost.com", "", "web"), "devpost")
  assert.equal(inferSource("", "https://acesat-ai-agent.devpost.com/", "web"), "devpost")
})

test("inferSource resolves the real platform per host", () => {
  assert.equal(inferSource("https://www.linkedin.com/posts/abc", "", "web"), "linkedin")
  assert.equal(inferSource("", "https://lu.ma/hack-mde", "web"), "luma")
  assert.equal(inferSource("https://www.meetup.com/bogota-js/events/1", "", "web"), "meetup")
  assert.equal(inferSource("https://medellin.eventbrite.co", "", "web"), "eventbrite")
  assert.equal(inferSource("https://reddit.com/r/hackathon/x", "", "web"), "reddit")
})

test("inferSource: post host (sourceRef) wins over apply host (url)", () => {
  // found on X, applies on Devpost → still 'x'
  assert.equal(inferSource("https://baskchallenge.devpost.com", "https://x.com/p/1", "web"), "x")
})

test("inferSource falls back when host is unknown/absent", () => {
  assert.equal(inferSource("https://example.org/apply", "", "web"), "web")
  assert.equal(inferSource("", "", "manual"), "manual")
})

// ── selectHits ────────────────────────────────────────────────────────────────

function make(source, n, prefix = "") {
  return Array.from({ length: n }, (_, i) => ({ source, text: `${prefix}${source} post ${i}`, urls: [] }))
}

test("selectHits: returns all when under the cap", () => {
  const hits = make("x", 5)
  assert.deepEqual(selectHits(hits, [], 180), hits)
})

test("selectHits: X firehose no longer starves the other lanes", () => {
  // Mirror a real run: X dwarfs everything, LinkedIn/Reddit/IG are the minority.
  const hits = [
    ...make("x", 224), ...make("web", 113), ...make("github", 56),
    ...make("reddit", 58), ...make("linkedin", 40), ...make("instagram", 16),
  ]
  const picked = selectHits(hits, [], 180)
  assert.equal(picked.length, 180)
  const bySrc = picked.reduce((m, h) => ((m[h.source] = (m[h.source] || 0) + 1), m), {})
  // Every scraped lane must reach the classifier — this was the whole bug.
  for (const lane of ["x", "web", "github", "reddit", "linkedin", "instagram"]) {
    assert.ok(bySrc[lane] > 0, `lane ${lane} missing from selection`)
  }
  // Smallest lane is taken in full; the rest get a fair, comparable share.
  assert.equal(bySrc.instagram, 16)
  assert.ok(bySrc.linkedin >= 30, `linkedin got a fair share (was ${bySrc.linkedin}, used to be 0)`)
  // X must NOT devour the budget anymore — round-robin caps it near the fair share.
  assert.ok(bySrc.x <= 40, `X capped by round-robin (got ${bySrc.x}, firehose was 224)`)
  // No lane should be starved below the shared floor.
  for (const lane of ["x", "web", "github", "reddit", "linkedin"]) {
    assert.ok(bySrc[lane] >= 16, `lane ${lane} under fair floor: ${bySrc[lane]}`)
  }
})

test("selectHits: order-matching hits survive the cap first", () => {
  const hits = [
    ...make("x", 224),
    { source: "linkedin", text: "Hackathon in Medellín, Colombia this month", urls: [] },
  ]
  const picked = selectHits(hits, ["medellin", "colombia"], 180)
  assert.ok(picked.some((h) => /Medell/.test(h.text)), "the Medellín hit must be kept")
})

test("selectHits: order match is accent-insensitive", () => {
  const hits = [
    ...make("x", 200),
    { source: "web", text: "Bogota hackathon, sedes regionales", urls: [] }, // no accent in post
  ]
  // order stores the accented form
  const picked = selectHits(hits, ["Bogotá"], 180)
  assert.ok(picked.some((h) => /Bogota/.test(h.text)), "accent-insensitive match failed")
})

// ── deadlineType derivation ───────────────────────────────────────────────────

test("deadlineTypeOf: explicit valid type always wins", () => {
  assert.equal(deadlineTypeOf({ deadlineType: "recurring", deadline: "2026-08-01" }), "recurring")
  assert.equal(deadlineTypeOf({ deadlineType: "always-open", rolling: false }), "always-open")
})

test("deadlineTypeOf: legacy records derive rolling -> fixed -> unknown", () => {
  assert.equal(deadlineTypeOf({ rolling: true, deadline: "2026-08-01" }), "rolling")
  assert.equal(deadlineTypeOf({ rolling: false, deadline: "2026-08-01" }), "fixed")
  assert.equal(deadlineTypeOf({ rolling: false, deadline: null }), "unknown")
  assert.equal(deadlineTypeOf({}), "unknown")
  // invalid explicit value falls back to derivation
  assert.equal(deadlineTypeOf({ deadlineType: "whenever", deadline: "2026-08-01" }), "fixed")
})

test("rollingFromDeadlineType keeps the legacy boolean in sync", () => {
  assert.equal(rollingFromDeadlineType("rolling"), true)
  assert.equal(rollingFromDeadlineType("always-open"), true)
  assert.equal(rollingFromDeadlineType("fixed"), false)
  assert.equal(rollingFromDeadlineType("recurring"), false)
  assert.equal(rollingFromDeadlineType("unknown"), false)
})

// ── mergeOpportunity ──────────────────────────────────────────────────────────

const storedThiel = {
  id: "opp-abc123", title: "Thiel Fellowship 2026", host: "Thiel Foundation",
  category: "fellowship", goals: ["funding"], priority: "high", leverageScore: 5,
  leverageNote: "my edited note", status: "pursuing", deadline: "2026-01-10",
  rolling: false, location: "Global", modality: "remote", eligibility: "remote-global",
  reward: "$100k", url: "https://thielfellowship.org/old", officialUrl: "",
  source: "web", sourceRef: "https://x.com/p/1", discoveredAt: "2025-11-01T00:00:00Z",
  runId: "2025-11-01T00:00:00Z", notes: "asked mentor about it", tags: ["fellowship"],
}
const incomingThiel = {
  id: "opp-zzz999", title: "Thiel Fellowship 2027", host: "Thiel Foundation",
  category: "fellowship", goals: [], priority: "medium", leverageScore: 3,
  leverageNote: "classifier note", status: "new", deadline: "2026-12-31",
  deadlineType: "fixed", rolling: false, recurrence: "annual",
  nextWindowExpected: null, amountUsd: 200000, requires18Plus: null, effort: "high",
  location: "Global", modality: "remote", eligibility: "remote-global",
  reward: "$200k over two years", url: "https://thielfellowship.org/apply",
  officialUrl: "https://thielfellowship.org", source: "web",
  sourceRef: "https://x.com/p/2", discoveredAt: "2026-07-10T00:00:00Z",
  notes: "", tags: ["fellowship", "2027"],
}

test("mergeOpportunity: user-owned fields are preserved", () => {
  const m = mergeOpportunity(storedThiel, incomingThiel, { runId: "2026-07-10T09:00:00Z", today: "2026-07-10" })
  assert.equal(m.id, "opp-abc123")
  assert.equal(m.status, "pursuing")
  assert.equal(m.priority, "high")
  assert.equal(m.leverageScore, 5)
  assert.equal(m.leverageNote, "my edited note")
  assert.equal(m.title, "Thiel Fellowship 2026")
  assert.equal(m.discoveredAt, "2025-11-01T00:00:00Z") // original kept
})

test("mergeOpportunity: radar-owned fields refresh from the new sighting", () => {
  const m = mergeOpportunity(storedThiel, incomingThiel, { runId: "2026-07-10T09:00:00Z", today: "2026-07-10" })
  assert.equal(m.deadline, "2026-12-31")
  assert.equal(m.deadlineType, "fixed")
  assert.equal(m.rolling, false)
  assert.equal(m.recurrence, "annual")
  assert.equal(m.amountUsd, 200000)
  assert.equal(m.effort, "high")
  assert.equal(m.reward, "$200k over two years")
  assert.equal(m.url, "https://thielfellowship.org/apply")
  assert.equal(m.officialUrl, "https://thielfellowship.org")
  assert.deepEqual(m.tags, ["fellowship", "2027"])
  assert.equal(m.runId, "2026-07-10T09:00:00Z") // new run stamp
})

test("mergeOpportunity: appends a refresh note ONLY when the deadline changed", () => {
  const m = mergeOpportunity(storedThiel, incomingThiel, { runId: "2026-07-10T09:00:00Z", today: "2026-07-10" })
  assert.match(m.notes, /^asked mentor about it\n\(refreshed for new cycle 2026-07-10\)$/)
  // same deadline -> notes untouched
  const same = mergeOpportunity(storedThiel, { ...incomingThiel, deadline: "2026-01-10" }, { runId: "2026-07-10T09:00:00Z", today: "2026-07-10" })
  assert.equal(same.notes, "asked mentor about it")
})

test("mergeOpportunity: blank incoming values never erase existing intel", () => {
  const m = mergeOpportunity(storedThiel, { ...incomingThiel, url: "", reward: "", modality: "unknown", tags: [] },
    { runId: "2026-07-10T09:00:00Z", today: "2026-07-10" })
  assert.equal(m.url, "https://thielfellowship.org/old")
  assert.equal(m.reward, "$100k")
  assert.equal(m.modality, "remote")
  assert.deepEqual(m.tags, ["fellowship"])
})

test("mergeOpportunity: rolling boolean stays in sync when the cycle goes rolling", () => {
  const m = mergeOpportunity(storedThiel, { ...incomingThiel, deadline: null, deadlineType: "rolling" },
    { runId: "2026-07-10T09:00:00Z", today: "2026-07-10" })
  assert.equal(m.deadlineType, "rolling")
  assert.equal(m.rolling, true)
  assert.equal(m.deadline, null)
})

// ── auto-archive ──────────────────────────────────────────────────────────────

test("shouldAutoArchive: boundary at exactly -7d (7 days past = keep, 8 = archive)", () => {
  const today = "2026-07-10"
  assert.equal(addDays(today, -7), "2026-07-03")
  const base = { status: "new", deadlineType: "fixed" }
  assert.equal(shouldAutoArchive({ ...base, deadline: "2026-07-03" }, today), false) // exactly -7d
  assert.equal(shouldAutoArchive({ ...base, deadline: "2026-07-02" }, today), true)  // -8d
  assert.equal(shouldAutoArchive({ ...base, deadline: "2026-07-09" }, today), false) // yesterday
})

test("shouldAutoArchive: never touches engaged statuses or non-fixed types", () => {
  const today = "2026-07-10"
  for (const status of ["pursuing", "applied", "won", "lost", "archived"]) {
    assert.equal(shouldAutoArchive({ status, deadlineType: "fixed", deadline: "2026-01-01" }, today), false, status)
  }
  assert.equal(shouldAutoArchive({ status: "new", deadlineType: "rolling", deadline: "2026-01-01" }, today), false)
  assert.equal(shouldAutoArchive({ status: "new", deadlineType: "recurring", deadline: "2026-01-01" }, today), false)
  // legacy record without deadlineType but with an old date derives 'fixed' -> archives
  assert.equal(shouldAutoArchive({ status: "new", deadline: "2026-01-01", rolling: false }, today), true)
})

// ── mergeClassified (ingest integration: merge-not-drop) ─────────────────────

test("mergeClassified: a year-stripped title collision REFRESHES instead of dropping", () => {
  const existing = { items: [storedThiel], lastRun: null }
  const runId = "2026-07-10T09:00:00Z"
  const { merged, added, refreshed } = mergeClassified(existing, [incomingThiel], runId, undefined)
  assert.equal(added.length, 0)
  assert.equal(refreshed, 1)
  assert.equal(merged.items.length, 1)
  const it = merged.items[0]
  assert.equal(it.id, "opp-abc123")          // user identity kept
  assert.equal(it.deadline, "2026-12-31")    // radar intel refreshed
  assert.equal(it.status, "pursuing")
})

test("mergeClassified: auto-archives stale fixed items and counts them", () => {
  const stale = { ...storedThiel, id: "opp-old", title: "Old Hack Week", host: "X", url: "https://oldhack.example.com", sourceRef: "https://oldhack.example.com", status: "new", deadline: "2026-06-01", rolling: false }
  const { merged, archived } = mergeClassified({ items: [stale], lastRun: null }, [], "2026-07-10T09:00:00Z", undefined)
  assert.equal(archived, 1)
  assert.equal(merged.items[0].status, "archived")
})

// ── normalizeRecord (new-field defaults) ──────────────────────────────────────

test("normalizeRecord: defaults + derives deadlineType and keeps rolling in sync", () => {
  const runId = "2026-07-10T09:00:00Z"
  const legacy = normalizeRecord({ title: "Some Grant", host: "Org", url: "https://g.example.com", rolling: true }, runId)
  assert.equal(legacy.deadlineType, "rolling")
  assert.equal(legacy.rolling, true)
  assert.equal(legacy.amountUsd, null)
  assert.equal(legacy.requires18Plus, null)
  assert.equal(legacy.effort, null)
  assert.equal(legacy.officialUrl, "")
  const dated = normalizeRecord({ title: "Comp", url: "https://c.example.com", deadline: "2026-09-01" }, runId)
  assert.equal(dated.deadlineType, "fixed")
  assert.equal(dated.rolling, false)
  // always-open forces rolling=true even if the classifier said rolling=false
  const open = normalizeRecord({ title: "Club", url: "https://o.example.com", deadlineType: "always-open", rolling: false }, runId)
  assert.equal(open.rolling, true)
  // amountUsd accepts numeric strings, rejects junk
  assert.equal(normalizeRecord({ title: "A", url: "https://a.example.com", amountUsd: "50000" }, runId).amountUsd, 50000)
  assert.equal(normalizeRecord({ title: "B", url: "https://b.example.com", amountUsd: "lots" }, runId).amountUsd, null)
  // new categories pass the whitelist
  assert.equal(normalizeRecord({ title: "P", url: "https://p.example.com", category: "program" }, runId).category, "program")
  assert.equal(normalizeRecord({ title: "R", url: "https://r.example.com", category: "residency" }, runId).category, "residency")
})

// ── seed-record mapping ───────────────────────────────────────────────────────

test("mapCatalogEntry: catalog entry -> Opportunity record", () => {
  const entry = {
    title: "Z Fellows", host: "Z Fellows (Cory Levy)", category: "fellowship",
    url: "https://www.zfellows.com/", deadlineType: "rolling", deadline: null,
    recurrence: "multiple cohorts per year", nextWindowExpected: null, amountUsd: 10000,
    reward: "$10k + network", requires18Plus: false,
    eligibilityNotes: "No age restriction.", modality: "hybrid",
    location: "Global", eligibility: "remote-global",
    fitNotes: "Great fit for young builders.", priority: "high", leverageScore: 5,
  }
  const rec = mapCatalogEntry(entry, "2026-07-10T09:00:00Z")
  assert.equal(rec.id, stableId({ url: "https://www.zfellows.com/" }))
  assert.match(rec.id, /^opp-[0-9a-f]{12}$/)
  assert.equal(rec.source, "catalog")
  assert.equal(rec.sourceRef, "https://www.zfellows.com/")
  assert.equal(rec.officialUrl, "https://www.zfellows.com/")
  assert.deepEqual(rec.goals, ["funding"])       // fellowship -> funding
  assert.equal(rec.leverageNote, "Great fit for young builders.")
  assert.equal(rec.notes, "No age restriction.")
  assert.equal(rec.status, "new")
  assert.equal(rec.deadlineType, "rolling")
  assert.equal(rec.rolling, true)                // legacy boolean synced
  assert.equal(rec.amountUsd, 10000)
  assert.equal(rec.requires18Plus, false)
  assert.equal(rec.discoveredAt, "2026-07-10T09:00:00Z")
  // scholarship maps to the exchange goal
  const sch = mapCatalogEntry({ ...entry, category: "scholarship", url: "https://elap.example.com" }, "2026-07-10T09:00:00Z")
  assert.deepEqual(sch.goals, ["exchange"])
  // competitions are visibility plays
  const comp = mapCatalogEntry({ ...entry, category: "competition", url: "https://hack.example.com" }, "2026-07-10T09:00:00Z")
  assert.deepEqual(comp.goals, ["users", "social-growth"])
})

test("mapCatalogEntry: identical url -> identical id across runs (idempotent seeding)", () => {
  const a = mapCatalogEntry({ title: "X", url: "https://prog.example.com" }, "2026-07-10T00:00:00Z")
  const b = mapCatalogEntry({ title: "X renamed", url: "https://prog.example.com" }, "2026-07-11T00:00:00Z")
  assert.equal(a.id, b.id)
})
