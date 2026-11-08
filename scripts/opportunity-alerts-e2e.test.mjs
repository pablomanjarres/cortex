// End to end: a scratch Cortex API (same /api/data contract and 409 rev checks as
// electron/main.ts) + the BUILT MCP server over stdio + a real MCP client, playing the
// two outside actors: ChatGPT's weekly research (add_opportunities) and Kaiser's
// scheduled check (get_opportunity_alerts -> post -> ack_opportunity_alerts).
// Requires `npm run build --prefix mcp-server` (npm test does it first).
import { test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Client } from "../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js"
import { StdioClientTransport } from "../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js"
import { bogotaToday, addDays } from "./radar-lib.mjs"

const MCP = fileURLToPath(new URL("../mcp-server/dist/index.js", import.meta.url))

/** In-memory /api/data with revs, like the Cortex app. */
function scratchCortex(seed) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, { data: v, rev: 1 }]))
  let clock = 1
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x")
    if (url.pathname !== "/api/data") { res.writeHead(404); res.end(); return }
    if (req.method === "GET") {
      const e = store.get(url.searchParams.get("key"))
      res.writeHead(200, { "content-type": "application/json", ...(e ? { "x-cortex-rev": String(e.rev) } : {}) })
      res.end(JSON.stringify(e ? e.data : null))
      return
    }
    let body = ""
    req.on("data", (c) => { body += c })
    req.on("end", () => {
      const { key, data, baseRev } = JSON.parse(body)
      const cur = store.get(key)
      if (baseRev != null && String(baseRev) !== String(cur?.rev ?? null)) {
        res.writeHead(409, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: "conflict", rev: cur ? String(cur.rev) : null, data: cur?.data ?? null }))
        return
      }
      store.set(key, { data, rev: ++clock })
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true, rev: String(clock) }))
    })
  })
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, store, api: `http://127.0.0.1:${server.address().port}` })))
}

const today = bogotaToday()
const intel = (x = {}) => ({
  fields: ["founder", "ai"], legit: true, ageMin: 18, colombiaAllowed: true, undergradAllowed: true, inPerson: false,
  prestige: 8, network: 9, founderDensity: 9, technicalDensity: 8, investorAccess: 8, careerUpside: 8, skillGain: 8,
  probability: 0.1, effortHours: 4, durationDays: 30, hoursPerWeek: 10, fullTime: false, ...x,
})
const existing = (id, title, x = {}) => ({
  id, title, host: title, category: "fellowship", goals: [], priority: "medium", leverageScore: 3,
  leverageNote: `${title} matters.`, status: "new", deadline: addDays(today, 40), deadlineType: "fixed", rolling: false,
  location: "Remote", modality: "remote", eligibility: "remote-global", reward: "", url: `https://${id}.example/apply`,
  officialUrl: "", source: "web", sourceRef: `https://${id}.example/apply`, discoveredAt: `${today}T00:00:00Z`, runId: "r0",
  notes: "", tags: [], lastVerified: today, evidence: `https://${id}.example — stated`, intel: intel({ cashUsd: 5000 }), ...x,
})

test("ChatGPT research -> Cortex queue -> Kaiser read/ack, with retry and no duplicates", { skip: !existsSync(MCP) && "build mcp-server first" }, async () => {
  const seed = {
    "cortex-opportunities": {
      items: [
        existing("old-a", "Old Fellowship A"),
        existing("old-b", "Old Fellowship B"),
        existing("closed-c", "Cycle Grant C", { deadline: null, deadlineType: "recurring", nextWindowExpected: "Estimated 2027" }),
      ],
      lastRun: null,
      report: "27 found · 27 kept · 0 hidden",
    },
  }
  const { server, store, api } = await scratchCortex(seed)
  const client = new Client({ name: "kaiser-e2e", version: "1.0.0" })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [MCP], env: { ...process.env, CORTEX_API: api }, stderr: "ignore" }))
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args })
    assert.ok(!r.isError, `${name}: ${r.content?.[0]?.text}`)
    return JSON.parse(r.content[0].text)
  }
  try {
    // 1. First Kaiser check after deploy: silent baseline of the existing radar.
    const first = await call("get_opportunity_alerts")
    assert.equal(first.check.baseline, true)
    assert.equal(first.hasAlerts, false)
    assert.equal(first.message, "No new opportunity alerts.")

    // 2. Weekly ChatGPT research lands through add_opportunities.
    const research = {
      runId: `chatgpt-weekly-${today}`,
      opportunities: [
        { title: "Quantum Founders Sprint", host: "QF", category: "fellowship", url: "https://qf.example/apply",
          officialUrl: "https://qf.example/sprint", deadline: addDays(today, 4), deadlineType: "fixed", location: "Remote",
          modality: "remote", eligibility: "remote-global", leverageNote: "Equity-free grant and elite founder cohort.",
          evidence: "https://qf.example/sprint: 'Applications close ... open worldwide, 18+'", intel: intel({ cashUsd: 15000 }) },
        { title: "Cycle Grant C", host: "Cycle Grant C", category: "fellowship", url: "https://closed-c.example/apply",
          deadline: addDays(today, 30), deadlineType: "fixed", location: "Remote", modality: "remote",
          evidence: "https://closed-c.example: 2027 cycle open", intel: intel({ cashUsd: 5000 }) },
        { title: "Robot Arm Summit SF", host: "RAS", category: "program", url: "https://ras.example/apply",
          deadline: addDays(today, 20), deadlineType: "fixed", location: "San Francisco, CA", modality: "in-person",
          programStart: "2027-03-10", programEnd: "2027-03-12", evidence: "https://ras.example: March 10-12, 2027",
          intel: intel({ fields: ["manipulation", "robotics"], inPerson: true, city: "San Francisco", country: "United States", travelCovered: true, housingCovered: true }) },
        { title: "Seed Track Accelerator", host: "STA", category: "accelerator", url: "https://sta.example/apply",
          deadline: addDays(today, 25), deadlineType: "fixed", location: "Remote", modality: "remote", amountUsd: 250000,
          evidence: "https://sta.example: $250k for 7%", intel: intel({ investmentUsd: 250000, equityPct: 7, cashUsd: null, prestige: 9 }) },
      ],
    }
    const added = await call("add_opportunities", research)
    assert.equal(added.added, 3)
    assert.equal(added.refreshed, 1, "the closed program was refreshed, not duplicated")
    assert.equal(added.alerts.created >= 4, true, JSON.stringify(added.alerts))
    assert.ok(Number.isFinite(Date.parse(store.get("cortex-opportunities").data.lastRun)), "lastRun stays a timestamp")

    // 3. Kaiser's check: one urgent card (verified deadline in 4 days) + the weekly digest.
    const d1 = await call("get_opportunity_alerts")
    assert.equal(d1.hasAlerts, true)
    assert.equal(d1.urgent, 1)
    assert.match(d1.message, /^URGENT/)
    assert.match(d1.message, /Quantum Founders Sprint/)
    assert.match(d1.message, /Reopened: Cycle Grant C/)
    assert.match(d1.message, /US_TRAVEL_BLOCKED/)
    assert.match(d1.message, /Investment: \$250,000 for 7% equity \(not a grant\)/)
    assert.doesNotMatch(d1.message, /Grant: \$250,000/)
    const ids = d1.alertIds

    // 4. Posting failed (or Kaiser lost the tunnel): nothing is lost.
    const fail = await call("ack_opportunity_alerts", { alertIds: ids, delivered: false, note: "post failed" })
    assert.deepEqual(fail.failed.sort(), [...ids].sort())
    const d2 = await call("get_opportunity_alerts")
    assert.deepEqual([...d2.alertIds].sort(), [...ids].sort(), "same alerts offered again")

    // 5. Posted: ack, and the queue is empty.
    const ok = await call("ack_opportunity_alerts", { alertIds: ids })
    assert.equal(ok.acked.length, ids.length)
    assert.equal((await call("get_opportunity_alerts")).hasAlerts, false)

    // 6. Next week's identical research: refresh only, zero new alerts.
    assert.equal(store.get("cortex-opportunities").data.report, "27 found · 27 kept · 0 hidden", "a chat add without a report keeps the weekly line")
    const again = await call("add_opportunities", { ...research, runId: `chatgpt-weekly-${today}-2` })
    assert.equal(again.added, 0)
    assert.equal(again.alerts.created, 0)
    assert.equal((await call("get_opportunity_alerts", { mode: "all" })).hasAlerts, false)

    // 7. Reads carry derived facts; travel readiness is editable data.
    const read = await call("get_opportunities", { limit: 50 })
    const ras = read.items.find((o) => o.title === "Robot Arm Summit SF")
    assert.equal(ras.facts.travel.flag, "US_TRAVEL_BLOCKED")
    assert.equal(ras.facts.applicationStatus, "open")
    await call("set_travel_readiness", { country: "US", visa: "approved" })
    const after = (await call("get_opportunities", { limit: 50 })).items.find((o) => o.title === "Robot Arm Summit SF")
    assert.equal(after.facts.travel.flag, null)

    // /health reports a hand-kept tool count; it must match what the server registers.
    const { tools } = await client.listTools()
    const source = readFileSync(new URL("../mcp-server/src/index.ts", import.meta.url), "utf8")
    assert.equal(Number(source.match(/ok: true, tools: (\d+)/)?.[1]), tools.length, "/health tool count")

    const alertsStore = store.get("cortex-opportunity-alerts").data
    assert.equal(new Set(alertsStore.alerts.map((a) => a.dedupeKey)).size, alertsStore.alerts.length, "no duplicate alerts stored")
  } finally {
    await client.close()
    server.close()
  }
})
