// node --test scripts/radar-lib.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { inferSource, hostOf, deburr, selectHits } from "./radar-lib.mjs"

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
