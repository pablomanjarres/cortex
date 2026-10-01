// node --test scripts/calendar-span.test.mjs
//
// Integration test for the calendar helper's recurring-event handling.
//
// Unlike the other scripts/*.test.mjs suites this one is NOT pure: it compiles
// the Swift helper straight out of SWIFT_SOURCE in electron/calendar.ts and
// runs it against the real EventKit store, because the bug it guards is a
// property of how EventKit interprets a save span — there is nothing to unit
// test in JS. It creates its events in the year 2099 and deletes them again,
// so it never touches a real appointment.
//
// Skips itself (rather than failing) when the platform, toolchain, or calendar
// permission isn't available, so `node --test scripts/` stays green off-macOS.

import { test, before, after, afterEach, describe } from "node:test"
import assert from "node:assert/strict"
import { execFileSync, execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, "..")

// The far-future anchor. Weekly from here, so occurrences land on 02/09/16.
const ANCHOR = "2099-03-02"
const RANGE_END = "2099-03-23"
const OLD_TIME = ["09:00", "10:00"]
const NEW_TIME = ["14:00", "15:00"]
const TITLE = "Cortex span test — safe to delete"

let bin = null
let skipReason = null
const created = []

/** Pull SWIFT_SOURCE out of electron/calendar.ts exactly as ensureBinary() writes it. */
function extractSwiftSource() {
  const ts = fs.readFileSync(path.join(REPO, "electron", "calendar.ts"), "utf-8")
  const marker = "const SWIFT_SOURCE = `"
  const start = ts.indexOf(marker)
  assert.notEqual(start, -1, "SWIFT_SOURCE not found in electron/calendar.ts")
  let i = start + marker.length
  while (i < ts.length && ts[i] !== "`") {
    i += ts[i] === "\\" ? 2 : 1
  }
  assert.ok(i < ts.length, "SWIFT_SOURCE template literal is unterminated")
  const body = ts.slice(start + marker.length, i)
  assert.ok(!body.includes("${"), "SWIFT_SOURCE gained an interpolation; update this extractor")
  // Let JS itself do the unescaping, so the bytes match what ensureBinary writes.
  return new Function("return `" + body + "`")()
}

/**
 * Local UTC offset **on the given day**, as +HH:MM / -HH:MM, so
 * ISO8601DateFormatter accepts our dates.
 *
 * It has to be the offset for that date, not today's: in a DST zone the two
 * differ for half the year, which would stamp the wrong wall-clock time onto
 * the 2099 anchor and fail the assertions before the code under test runs.
 */
function offsetOn(day) {
  const mins = -new Date(`${day}T12:00:00Z`).getTimezoneOffset()
  const sign = mins < 0 ? "-" : "+"
  const a = Math.abs(mins)
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`
}

const at = (day, hhmm) => `${day}T${hhmm}:00${offsetOn(day)}`

function helper(args, stdin) {
  const out = execFileSync(bin, args, {
    input: stdin,
    encoding: "utf-8",
    timeout: 30_000,
  })
  return JSON.parse(out.trim())
}

/** Every occurrence of our test event inside the probe window. */
function occurrences() {
  return helper(["read-range", ANCHOR, RANGE_END]).filter((e) => e.title === TITLE)
}

const hhmm = (iso) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

before(() => {
  if (process.platform !== "darwin") {
    skipReason = "not macOS"
    return
  }
  try {
    execSync("command -v swiftc", { stdio: "ignore" })
  } catch {
    skipReason = "swiftc not installed"
    return
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cortex-span-test-"))
  const src = path.join(dir, "cal-helper.swift")
  fs.writeFileSync(src, extractSwiftSource())
  bin = path.join(dir, "cal-helper")
  try {
    execSync(`swiftc -O ${JSON.stringify(src)} -o ${JSON.stringify(bin)} -framework EventKit -framework Foundation`, {
      stdio: "pipe",
      timeout: 180_000,
    })
  } catch (e) {
    bin = null
    skipReason = `helper did not compile: ${e.stderr?.toString().slice(0, 400) ?? e.message}`
    return
  }

  // Prove we can actually WRITE to the store before asserting anything about
  // it. A read is no proof: with access denied EventKit hands back an empty
  // match instead of failing, so read-range exits 0 and we would sail on and
  // hard-fail at the first create.
  try {
    const probe = helper(["create"], JSON.stringify({
      title: TITLE,
      startDate: at(ANCHOR, OLD_TIME[0]),
      endDate: at(ANCHOR, OLD_TIME[1]),
    }))
    if (!probe.success || !probe.id) throw new Error(JSON.stringify(probe))
    helper(["delete", probe.id])
  } catch (e) {
    bin = null
    skipReason = `no calendar write access: ${e.message}`
  }
})

/**
 * Remove every trace of the test event, series and detached occurrences alike.
 * Detached copies carry their own ids, so sweep by title until the window is
 * empty rather than trusting the ids we remember creating.
 */
function cleanupAll() {
  if (!bin) return
  for (const id of created.splice(0)) {
    try { helper(["delete", id]) } catch { /* may already be gone */ }
  }
  for (let pass = 0; pass < 5; pass += 1) {
    const left = occurrences()
    if (!left.length) return
    for (const e of left) {
      try { helper(["delete", e.id]) } catch { /* best effort */ }
    }
  }
}

afterEach(cleanupAll)

after(() => {
  cleanupAll()
  const leftovers = bin ? occurrences() : []
  if (leftovers.length) {
    console.error(`[cleanup] ${leftovers.length} test event(s) survived deletion — remove "${TITLE}" by hand`)
  }
})

/** Fresh weekly series at OLD_TIME. Returns its id. */
function createWeeklySeries() {
  const res = helper(["create"], JSON.stringify({
    title: TITLE,
    startDate: at(ANCHOR, OLD_TIME[0]),
    endDate: at(ANCHOR, OLD_TIME[1]),
    recurrence: "FREQ=WEEKLY",
  }))
  assert.equal(res.success, true, "could not create the test series")
  created.push(res.id)
  return res.id
}

describe("calendar helper: recurring update span", () => {
  test("updating a recurring event moves the whole series, without duplicating it", (t) => {
    if (skipReason) return t.skip(skipReason)

    const id = createWeeklySeries()

    const before = occurrences()
    assert.equal(before.length, 3, "expected 3 weekly occurrences in the probe window")
    assert.deepEqual([...new Set(before.map((e) => hhmm(e.startDate)))], [OLD_TIME[0]])

    const res = helper(["update", id], JSON.stringify({
      startDate: at(ANCHOR, NEW_TIME[0]),
      endDate: at(ANCHOR, NEW_TIME[1]),
    }))
    assert.equal(res.success, true)

    const after = occurrences()

    // The regression: EventKit reads span .thisEvent as "detach this one", so
    // only the anchor occurrence moves and the rest of the series stays at
    // 09:00. Update an occurrence other than the anchor and the detached copy
    // shows up alongside the original instead, which is the duplicate users see.
    assert.deepEqual(
      [...new Set(after.map((e) => hhmm(e.startDate)))], [NEW_TIME[0]],
      `only part of the series moved — occurrences at ` +
      `${after.map((e) => hhmm(e.startDate)).sort().join(", ")}`,
    )
    assert.equal(
      after.length, 3,
      `occurrence count changed from 3 to ${after.length} — the update detached a copy`,
    )
    assert.ok(
      after.every((e) => e.recurrence),
      "the moved occurrences lost their recurrence rule (they were detached)",
    )
  })

  test("update restores a recurrence rule on an event that lost one", (t) => {
    if (skipReason) return t.skip(skipReason)

    // A one-off, standing in for an event the old .thisEvent bug detached.
    const res = helper(["create"], JSON.stringify({
      title: TITLE,
      startDate: at(ANCHOR, OLD_TIME[0]),
      endDate: at(ANCHOR, OLD_TIME[1]),
    }))
    assert.equal(res.success, true)
    created.push(res.id)
    assert.equal(occurrences().length, 1, "should start as a single one-off")

    const upd = helper(["update", res.id], JSON.stringify({
      startDate: at(ANCHOR, NEW_TIME[0]),
      endDate: at(ANCHOR, NEW_TIME[1]),
      recurrence: "FREQ=WEEKLY",
    }))
    assert.equal(upd.success, true)

    const after = occurrences()
    assert.equal(after.length, 3, "the event should now repeat weekly")
    assert.deepEqual([...new Set(after.map((e) => hhmm(e.startDate)))], [NEW_TIME[0]])
  })

  test("span 'thisEvent' still detaches a single occurrence when asked for", (t) => {
    if (skipReason) return t.skip(skipReason)

    const id = createWeeklySeries()

    const res = helper(["update", id], JSON.stringify({
      startDate: at(ANCHOR, NEW_TIME[0]),
      endDate: at(ANCHOR, NEW_TIME[1]),
      span: "thisEvent",
    }))
    assert.equal(res.success, true)

    const after = occurrences()
    const moved = after.filter((e) => hhmm(e.startDate) === NEW_TIME[0])
    const stayed = after.filter((e) => hhmm(e.startDate) === OLD_TIME[0])

    assert.equal(moved.length, 1, "exactly one occurrence should have moved")
    assert.ok(stayed.length >= 1, "the rest of the series should have stayed put")
  })
})
