// node --test scripts/todoist-sync.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { applyPlanToStore, matchesTask, planTodoistSync, prepDate, syncTodoist, taskTitle } from "./todoist-sync.mjs"
import { buildStore } from "./radar-ingest.mjs"
import { DEFAULT_TRAVEL_READINESS } from "../src/features/opportunities/travel-readiness.ts"

const today = "2026-11-09"
const readiness = DEFAULT_TRAVEL_READINESS
const opp = (o = {}) => ({
  id: "opp-z", title: "Z Fellows", host: "Z Fellows", category: "fellowship", status: "new",
  deadline: "2026-12-01", deadlineType: "fixed", url: "https://zfellows.com/apply", officialUrl: "https://www.zfellows.com/",
  lastVerified: today, evidence: "https://www.zfellows.com/ — deadline Dec 1", notes: "", modality: "remote", location: "Remote",
  effort: "medium", intel: { inPerson: false }, ...o,
})
const task = (t = {}) => ({ id: "t1", content: "Z Fellows", description: "", labels: [], parent_id: null, section_id: null, checked: false, is_deleted: false, deadline: null, due: null, ...t })
const alert = (action = "Apply", priority = "digest") => ({ card: { action, why: "Dense founder network." }, priority })
const plan = (p) => planTodoistSync({ readiness, today, projectId: "P1", ...p })

test("taskTitle strips links and action prefixes", () => {
  assert.equal(taskTitle("Apply: [Z Fellows](https://zfellows.com)"), "Z Fellows")
  assert.equal(taskTitle("Apply to Neo Scholars https://neo.com/scholars"), "Neo Scholars")
})

test("matching: marker, URL and title; unrelated titles do not match", () => {
  assert.ok(matchesTask(opp(), task({ content: "Something", description: "cortex:opp-z" })))
  assert.ok(matchesTask(opp(), task({ content: "Fellowship app", description: "see https://zfellows.com/apply?ref=x" })))
  // A bare org homepage can host several programs, so it alone is not an identity.
  assert.ok(!matchesTask(opp({ title: "Other Program" }), task({ content: "Fellowship app", description: "https://www.zfellows.com/" })))
  assert.ok(matchesTask(opp(), task({ content: "Apply: Z Fellows 2027" })))
  assert.ok(!matchesTask(opp(), task({ content: "Buy groceries" })))
})

test("a Todoist task he filed marks the radar item premium and links it; labels are only added", () => {
  const p = plan({ items: [opp()], tasks: [task({ labels: ["mine"] })] })
  assert.deepEqual(p.links, [{ oppId: "opp-z", taskId: "t1", premium: true }])
  assert.equal(p.creates.length, 0)
  const u = p.updates[0]
  assert.deepEqual(u.body.labels, ["mine", "opportunity", "fellowship", "premium"])
  assert.equal(u.body.deadline_date, "2026-12-01", "fills a missing deadline with the verified one")
  assert.equal(u.body.content, undefined, "never rewrites his task text")
  assert.equal(u.body.due_date, undefined, "never moves his due date")
})

test("an official deadline he already set on his own task is never replaced", () => {
  const p = plan({ items: [opp()], tasks: [task({ deadline: { date: "2026-11-28" } })] })
  assert.equal(p.updates[0]?.body.deadline_date, undefined)
})

test("unverified deadlines are never written to Todoist", () => {
  const stale = opp({ lastVerified: "2026-08-01" })
  const p = plan({ items: [stale], tasks: [], actionable: new Map([["opp-z", alert("Verify")]]) })
  assert.equal(p.creates.length, 0, "Verify is not an application action")
  const p2 = plan({ items: [stale], tasks: [], actionable: new Map([["opp-z", alert("Apply")]]) })
  assert.equal(p2.creates[0].body.deadline_date, undefined)
  assert.equal(p2.creates[0].body.due_date, undefined)
})

test("an actionable alert creates one task with deadline, prep date, labels, link and marker", () => {
  const p = plan({ items: [opp()], tasks: [], actionable: new Map([["opp-z", alert("Apply", "urgent")]]) })
  assert.equal(p.creates.length, 1)
  const b = p.creates[0].body
  assert.equal(b.content, "Apply: Z Fellows")
  assert.equal(b.deadline_date, "2026-12-01")
  assert.equal(b.due_date, "2026-11-24")
  assert.equal(b.priority, 4)
  assert.equal(b.project_id, "P1")
  assert.deepEqual(b.labels, ["opportunity", "fellowship"])
  assert.match(b.description, /Official link: https:\/\/www\.zfellows\.com\//)
  assert.match(b.description, /cortex:opp-z/)
})

test("a U.S. in-person task carries the travel restriction", () => {
  const sf = opp({ modality: "in-person", location: "San Francisco", programStart: "2027-03-05", intel: { inPerson: true, city: "San Francisco" } })
  const b = plan({ items: [sf], tasks: [], actionable: new Map([["opp-z", alert("Prepare")]]) }).creates[0].body
  assert.ok(b.labels.includes("us-travel-blocked"))
  assert.match(b.description, /US_TRAVEL_BLOCKED/)
})

test("completed or deleted tasks are never touched or recreated; no duplicates", () => {
  const linked = opp({ todoistTaskId: "t9" })
  const done = plan({ items: [linked], tasks: [], linked: new Map([["t9", task({ id: "t9", checked: true })]]), actionable: new Map([["opp-z", alert()]]) })
  assert.deepEqual([done.creates.length, done.updates.length], [0, 0])
  assert.match(done.skipped[0].reason, /completed/)
  const gone = plan({ items: [linked], tasks: [], linked: new Map([["t9", null]]), actionable: new Map([["opp-z", alert()]]) })
  assert.deepEqual([gone.creates.length, gone.updates.length], [0, 0])
  const ours = plan({ items: [opp()], tasks: [task({ content: "Apply: Z Fellows", description: "x\ncortex:opp-z" })], actionable: new Map([["opp-z", alert()]]) })
  assert.equal(ours.creates.length, 0, "existing task found by marker")
})

test("unmatched tasks import as premium radar items; maybe-sections and sub-tasks do not", () => {
  const sections = { s1: "Watchlist", s2: "Applying" }
  const p = plan({
    items: [], sections,
    tasks: [
      task({ id: "a", content: "MIT Media Lab summer https://media.mit.edu/x", section_id: "s2", deadline: { date: "2027-01-15" } }),
      task({ id: "b", content: "Some maybe program", section_id: "s1" }),
      task({ id: "c", content: "Write essay", parent_id: "a" }),
    ],
  })
  assert.equal(p.imports.length, 1)
  const r = p.imports[0]
  assert.equal(r.title, "MIT Media Lab summer")
  assert.equal(r.premium, true)
  assert.equal(r.deadline, "2027-01-15")
  assert.equal(r.source, "manual")
  const store = applyPlanToStore({ items: [], lastRun: null }, p, [], "2026-11-09T00:00:00.000Z")
  assert.equal(store.items.length, 1)
  assert.equal(store.items[0].premium, true)
  assert.equal(store.items[0].todoistTaskId, "a")
  assert.equal(store.items[0].lastVerified, null, "his own date stays unverified until research confirms it")
  const again = applyPlanToStore(store, p, [], "2026-11-10T00:00:00.000Z")
  assert.equal(again.items.length, 1, "re-import is idempotent")
})

test("premium un-hides a profile-hidden item but not one he archived himself", () => {
  const p = { links: [{ oppId: "h", taskId: "1", premium: true }, { oppId: "m", taskId: "2", premium: true }], imports: [] }
  const store = applyPlanToStore({ items: [
    { id: "h", status: "archived", hiddenReason: "off-field" },
    { id: "m", status: "archived", hiddenReason: null },
  ] }, p, [], "now")
  assert.deepEqual(store.items.map((o) => [o.status, o.premium]), [["new", true], ["archived", true]])
})

test("prepDate leads by a week (two for heavy applications) and never lands in the past", () => {
  assert.equal(prepDate("2026-12-01", "medium", today), "2026-11-24")
  assert.equal(prepDate("2026-12-01", "high", today), "2026-11-17")
  assert.equal(prepDate("2026-11-11", "medium", today), today)
})

test("without a token the sync changes nothing", async () => {
  const saved = process.env.TODOIST_API_TOKEN
  delete process.env.TODOIST_API_TOKEN
  const r = await syncTodoist({ api: "http://127.0.0.1:9" }).catch((e) => ({ error: e.message }))
  if (saved) process.env.TODOIST_API_TOKEN = saved
  // Either no token anywhere (skipped) or a Keychain token exists and Cortex at :9 is unreachable.
  assert.ok(r.skipped || r.error, JSON.stringify(r))
})

test("shared ingest: ChatGPT research re-sightings refresh dates and evidence, keep premium and status", () => {
  const existing = { items: [{ ...opp(), status: "pursuing", premium: true, todoistTaskId: "t1", notes: "my notes", runId: "r0" }], lastRun: null }
  const { merged, added, refreshed } = buildStore(existing, [{
    title: "Z Fellows", host: "Z Fellows", category: "fellowship", url: "https://zfellows.com/apply",
    deadline: "2026-11-25", deadlineType: "fixed", opensAt: "2026-11-01", programStart: "2027-01-05", programEnd: "2027-01-12",
    evidence: "new wording", source: "web", lastVerified: today,
  }], "r1", today)
  assert.equal(added.length, 0)
  assert.equal(refreshed, 1)
  const o = merged.items[0]
  assert.deepEqual([o.deadline, o.opensAt, o.programStart, o.programEnd, o.evidence], ["2026-11-25", "2026-11-01", "2027-01-05", "2027-01-12", "new wording"])
  assert.deepEqual([o.status, o.premium, o.todoistTaskId, o.notes.startsWith("my notes")], ["pursuing", true, "t1", true])
})

test("shared ingest never stores an estimated date", () => {
  const { merged } = buildStore({ items: [] }, [{ title: "New Thing", host: "X", category: "grant", url: "https://x.example/a", opensAt: "early 2027", programStart: "2027-02-30", source: "web" }], "r1", today)
  assert.equal(merged.items[0].opensAt, null)
  assert.equal(merged.items[0].programStart, null)
})

test("generic one-word tasks never claim a program by title", () => {
  const purdue = opp({ id: "opp-p", title: "Purdue Summer Undergraduate Research Fellowship", url: "https://purdue.example/surf", officialUrl: "" })
  assert.ok(!matchesTask(purdue, task({ content: "Research" })))
  assert.ok(!matchesTask(purdue, task({ content: "Fellowship" })))
  assert.ok(matchesTask(purdue, task({ content: "Apply: Purdue Summer Undergraduate Research Fellowship" })))
})

test("personal admin tasks in the project are reported, never imported as opportunities", () => {
  const p = plan({
    items: [],
    tasks: [
      task({ id: "v", content: "US visa appointment" }),
      task({ id: "pp", content: "Renew passport" }),
      task({ id: "e", content: "Hack the North 2027" }),
      task({ id: "n", content: "Ask Juan about it" }),
    ],
  })
  assert.deepEqual(p.imports.map((r) => r.title), ["Hack the North 2027"])
  assert.deepEqual(p.unmatched, ["US visa appointment", "Renew passport", "Ask Juan about it"])
})

test("a task Cortex made for one program is never claimed by another sharing its homepage", () => {
  const a = opp({ id: "opp-a", title: "Program A", url: "https://org.example/a", officialUrl: "https://org.example/programs" })
  const madeForB = task({ id: "T1", content: "Apply: Program B", description: "Official link: https://org.example/programs\ncortex:opp-b" })
  assert.ok(!matchesTask(a, madeForB))
  const p = plan({ items: [a], tasks: [madeForB] })
  assert.deepEqual(p.links, [])
})

test("a re-sighting with a new deadline but no fresh proof is not verified", async () => {
  const { mergeOpportunity } = await import("./radar-lib.mjs")
  const { deadlineConfidenceOf } = await import("../src/features/opportunities/opportunity-window.ts")
  const prev = { ...opp(), opensAt: "2026-10-01", programStart: "2027-01-05" }
  const merged = mergeOpportunity(prev, { deadline: "2026-12-15" }, { runId: "r2", today })
  assert.deepEqual([merged.lastVerified, merged.evidence, merged.opensAt, merged.programStart], [null, null, null, null])
  assert.equal(deadlineConfidenceOf(merged, today), "unsupported")
  const same = mergeOpportunity(prev, { deadline: prev.deadline }, { runId: "r2", today })
  assert.deepEqual([same.lastVerified, same.evidence, same.opensAt], [prev.lastVerified, prev.evidence, prev.opensAt], "same cycle keeps its proof")
  // add_opportunities stamps lastVerified but sends no evidence: still not verified.
  const { merged: viaChat } = buildStore({ items: [] }, [{ title: "No Proof Grant", host: "NP", category: "grant", url: "https://np.example/a", deadline: "2026-12-01", source: "web", lastVerified: today }], "r1", today)
  assert.equal(deadlineConfidenceOf(viaChat.items[0], today), "unsupported")
})

test("the research run refuses to merge when Cortex cannot be read", async () => {
  const { readStoreWithRev } = await import("./radar-ingest.mjs")
  await assert.rejects(() => readStoreWithRev("http://127.0.0.1:9", "cortex-opportunities"))
})
