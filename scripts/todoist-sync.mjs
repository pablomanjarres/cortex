#!/usr/bin/env node
// todoist-sync — keep Pablo's existing Todoist "Opportunities" project and the Cortex radar
// in step, in both directions:
//   Todoist -> Cortex: every top-level task in the project is something he is 100% into.
//     A matching radar item is marked premium (filterable, never auto-hidden, ranked first,
//     re-verified every research run); an unmatched task is imported as a premium item.
//   Cortex -> Todoist: an opportunity with an actionable alert (Apply / Prepare) gets one
//     task with the action, the verified deadline (Todoist "deadline"), a preparation due
//     date, category/premium/travel labels, the official link and the visa warning.
//
// Safety: never creates projects; never touches completed or deleted tasks and never
// recreates a task he deleted; never writes a deadline that is not verified; on tasks he
// wrote himself it only adds labels and fills a missing deadline. Dedupe by a
// `cortex:<id>` marker, the stored task link, the official URL and the title.
//
// Token: env TODOIST_API_TOKEN, else macOS Keychain service "cortex-todoist" (account
// "api-token"). Without one, sync reports skipped and changes nothing.
//
// Usage: node scripts/todoist-sync.mjs [--dry]     Env: CORTEX_API, TODOIST_PROJECT.

import { execFile } from "node:child_process"
import { pathToFileURL } from "node:url"
import { ALERTS_KEY, normalizeAlertStore } from "../src/features/opportunities/opportunity-alerts.ts"
import { readinessOf, DEFAULT_TRAVEL_READINESS, TRAVEL_READINESS_KEY, travelCheckOf } from "../src/features/opportunities/travel-readiness.ts"
import { deadlineConfidenceOf } from "../src/features/opportunities/opportunity-window.ts"
import { premiumPatch } from "../src/features/opportunities/opportunity-model.ts"
import { mutateKey, readKey } from "./cortex-store.mjs"
import { normText, normUrl, normalizeRecord } from "./radar-ingest.mjs"
import { addDays, bogotaToday } from "./radar-lib.mjs"

const API = process.env.CORTEX_API ?? "http://localhost:3456"
const OPP_KEY = "cortex-opportunities"
const TODOIST = "https://api.todoist.com/api/v1"
const PROJECT = process.env.TODOIST_PROJECT ?? "Opportunities"
/** Sections whose tasks are maybes, not "100% interested". */
const NOT_PREMIUM_SECTION = /watch|maybe|later|someday|archive|rejected|done/i
const MAX_LINK_LOOKUPS = 50
const MARKER = (id) => `cortex:${id}`
/** Alert actions that deserve a Todoist task; Verify and Skip do not. */
const ACTIONABLE = new Set(["Apply", "Prepare"])
const URL_RE = /https?:\/\/[^\s)\]>"']+/g

// ── Pure planning ────────────────────────────────────────────────────────────

const urlsIn = (task) => `${task.content ?? ""} ${task.description ?? ""}`.match(URL_RE) ?? []
const markerIn = (task) => (task.description ?? "").match(/cortex:(opp-[A-Za-z0-9-]+)/)?.[1] ?? null

/** Task title without markdown links or an action prefix ("Apply: X", "Apply to X"). */
export function taskTitle(content) {
  return String(content ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(URL_RE, " ")
    .replace(/^\s*(apply|prepare|verify|submit|finish)\s*(to|for|:|-)?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** `short` appears in `long` as whole words, and is specific enough (2+ words) to identify a program. */
const containsName = (long, short) => short.split(" ").length >= 2 && ` ${long} `.includes(` ${short} `)

/** Same opportunity? Marker, stored link, URL, then title (equal, or one names the other). */
export function matchesTask(o, task) {
  const marker = markerIn(task)
  if (marker) return marker === o.id // a task Cortex made belongs to that one program only
  if (o.todoistTaskId && String(o.todoistTaskId) === String(task.id)) return true
  const oppUrls = [normUrl(o.url), normUrl(o.officialUrl)].filter((u) => u.length > 6 && u.includes("/"))
  if (urlsIn(task).some((u) => oppUrls.includes(normUrl(u)))) return true
  const a = normText(o.title)
  const b = normText(taskTitle(task.content))
  if (a.length < 5 || b.length < 5) return false
  return a === b || containsName(b, a) || containsName(a, b)
}

const OPPORTUNITY_WORDS = /\b(fellowship|fellows|grant|scholarship|hackathon|hack|accelerator|incubator|residency|internship|intern|program|programme|summer school|school|conference|summit|symposium|workshop|event|competition|challenge|olympiad|award|prize|camp|bootcamp|retreat|expo|fair|week|cohort|apply|application)\b/i
const ADMIN_WORDS = /\b(visa|passport|embassy|consulate|appointment|biometrics|renew|pay|payment|invoice|tax|bank)\b/i

/** A task worth importing as an opportunity: an event/program word or a link, and not personal admin. */
export function looksLikeOpportunity(task) {
  const text = `${task.content ?? ""} ${task.description ?? ""}`
  if (ADMIN_WORDS.test(task.content ?? "")) return false
  return OPPORTUNITY_WORDS.test(text) || urlsIn(task).length > 0
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

export function labelsFor(o, readiness) {
  const flag = travelCheckOf(o, readiness).flag
  return ["opportunity", slug(o.category || "other"), ...(o.premium ? ["premium"] : []), ...(flag ? [slug(flag)] : [])]
}

/** Preparation date: a week before (two for heavy applications), never in the past. */
export function prepDate(deadline, effort, today) {
  const lead = effort === "high" ? 14 : 7
  const d = addDays(deadline, -lead)
  return d < today ? today : d
}

function descriptionFor(o, card, today, readiness) {
  const travel = travelCheckOf(o, readiness)
  const verified = deadlineConfidenceOf(o, today) === "verified"
  return [
    card?.why || o.leverageNote || "",
    `Official link: ${o.officialUrl || o.url || "not recorded"}`,
    verified ? `Deadline ${o.deadline}, verified ${o.lastVerified}.` : "Deadline: not verified, check the official page.",
    travel.flag ? `${travel.flag}: ${travel.reason}` : "",
    MARKER(o.id),
  ].filter(Boolean).join("\n")
}

/**
 * Decide every Todoist and Cortex change without doing any.
 * @param {object} p
 * @param {object[]} p.items     radar opportunities
 * @param {object[]} p.tasks     ACTIVE tasks of the Opportunities project
 * @param {Record<string,string>} p.sections  section id -> name
 * @param {Map<string, object|null>} p.linked  task id -> task (null = gone) for links not among active tasks
 * @param {Map<string, object>} p.actionable   opp id -> its newest Apply/Prepare alert
 */
export function planTodoistSync({ items, tasks, sections = {}, linked = new Map(), actionable = new Map(), readiness, today, projectId }) {
  // links: radar item <-> task pairs to store (premium = newly marked premium).
  // unmatched: tasks that look like admin or notes, reported but never imported.
  const plan = { links: [], imports: [], creates: [], updates: [], skipped: [], unmatched: [] }
  const topLevel = tasks.filter((t) => !t.parent_id && !t.checked && !t.is_deleted)
  const claimed = new Set()

  for (const o of items) {
    if (!o?.id) continue
    let task = topLevel.find((t) => !claimed.has(t.id) && matchesTask(o, t)) ?? null
    // A finished application still owns its task: claim it so it is never re-imported, change nothing.
    if (["won", "lost"].includes(o.status)) { if (task) claimed.add(task.id); continue }
    if (!task && o.todoistTaskId && linked.has(String(o.todoistTaskId))) {
      const t = linked.get(String(o.todoistTaskId))
      if (!t || t.is_deleted) { plan.skipped.push({ oppId: o.id, reason: "task deleted in Todoist" }); continue }
      if (t.checked) { plan.skipped.push({ oppId: o.id, reason: "task completed in Todoist" }); continue }
      task = t
    }

    if (task) {
      claimed.add(task.id)
      const ours = markerIn(task) === o.id
      const sectionName = sections[task.section_id] ?? ""
      const premium = !ours && !task.parent_id && !NOT_PREMIUM_SECTION.test(sectionName)
      if ((premium && !o.premium) || String(o.todoistTaskId ?? "") !== String(task.id)) {
        plan.links.push({ oppId: o.id, taskId: String(task.id), premium: premium && !o.premium })
      }
      const effective = { ...o, premium: premium || !!o.premium }
      const want = labelsFor(effective, readiness)
      const have = Array.isArray(task.labels) ? task.labels : []
      const body = {}
      const labels = [...new Set([...have, ...want])]
      if (labels.length !== have.length) body.labels = labels
      const verified = deadlineConfidenceOf(o, today) === "verified" ? o.deadline : null
      const current = task.deadline?.date ?? null
      if (verified && verified !== current && (ours || !current)) {
        body.deadline_date = verified
        if (ours) body.due_date = prepDate(verified, o.effort, today)
      }
      if (ours) {
        const desc = descriptionFor(o, actionable.get(o.id)?.card, today, readiness)
        if (desc !== task.description) body.description = desc
      }
      if (Object.keys(body).length) plan.updates.push({ oppId: o.id, taskId: String(task.id), body })
      continue
    }

    if (o.todoistTaskId) continue // linked earlier but not looked up this run; never duplicate
    const alert = actionable.get(o.id)
    if (!alert || !ACTIONABLE.has(alert.card?.action) || ["archived", "applied"].includes(o.status)) continue
    const verified = deadlineConfidenceOf(o, today) === "verified" ? o.deadline : null
    plan.creates.push({
      oppId: o.id,
      body: {
        content: `${alert.card.action}: ${o.title}`,
        description: descriptionFor(o, alert.card, today, readiness),
        project_id: projectId,
        labels: labelsFor(o, readiness),
        priority: alert.priority === "urgent" ? 4 : 1,
        ...(verified ? { deadline_date: verified, due_date: prepDate(verified, o.effort, today) } : {}),
      },
    })
  }

  // Every remaining top-level task he filed outside "maybe" sections is a premium import.
  for (const t of topLevel) {
    if (claimed.has(t.id) || markerIn(t) || NOT_PREMIUM_SECTION.test(sections[t.section_id] ?? "")) continue
    const title = taskTitle(t.content)
    if (title.length < 3 || !looksLikeOpportunity(t)) { plan.unmatched.push(String(t.content ?? "").slice(0, 80)); continue }
    const url = urlsIn(t)[0] ?? ""
    const deadline = t.deadline?.date ?? null
    plan.imports.push({
      title, host: "", category: "other", url, officialUrl: "",
      deadline, deadlineType: deadline ? "fixed" : "unknown",
      source: "manual", sourceRef: `todoist:${t.id}`, status: "pursuing",
      premium: true, todoistTaskId: String(t.id),
      notes: String(t.description ?? "").slice(0, 600), tags: Array.isArray(t.labels) ? t.labels : [],
    })
  }
  return plan
}

/**
 * Apply plan.links / imports / created links to the radar blob. Pure. A premium item the
 * profile had auto-hidden comes back; one he archived himself stays archived.
 */
export function applyPlanToStore(store, plan, createdLinks, now) {
  const items = Array.isArray(store?.items) ? store.items : []
  const patch = new Map(plan.links.map((p) => [p.oppId, { premium: p.premium, todoistTaskId: p.taskId }]))
  for (const l of createdLinks) patch.set(l.oppId, { ...(patch.get(l.oppId) ?? {}), todoistTaskId: l.taskId })
  const next = items.map((o) => {
    const p = patch.get(o.id)
    if (!p) return o
    return { ...o, ...(p.premium ? premiumPatch(o, true) : {}), todoistTaskId: p.todoistTaskId }
  })
  const known = new Set(next.map((o) => o.sourceRef).filter(Boolean))
  const imported = plan.imports
    .filter((r) => !known.has(r.sourceRef))
    .map((r) => ({ ...normalizeRecord(r, `todoist-import-${now}`), premium: true, todoistTaskId: r.todoistTaskId }))
  return { ...store, items: [...imported, ...next] }
}

// ── Todoist REST v1 ──────────────────────────────────────────────────────────

export function todoistToken() {
  if (process.env.TODOIST_API_TOKEN) return Promise.resolve(process.env.TODOIST_API_TOKEN.trim())
  return new Promise((resolve) => {
    execFile("security", ["find-generic-password", "-s", "cortex-todoist", "-a", "api-token", "-w"], { timeout: 10_000 },
      (err, stdout) => resolve(err ? null : String(stdout).trim() || null))
  })
}

export function todoistClient(token, fetchImpl = fetch) {
  const call = async (method, path, body, requestId) => {
    const res = await fetchImpl(`${TODOIST}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Todoist ${res.status} ${method} ${path.split("?")[0]}`)
    return res.status === 204 ? {} : res.json()
  }
  const all = async (path) => {
    const out = []
    let cursor = null
    for (let page = 0; page < 20; page++) {
      const sep = path.includes("?") ? "&" : "?"
      const r = await call("GET", `${path}${sep}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)
      out.push(...(r?.results ?? []))
      cursor = r?.next_cursor ?? null
      if (!cursor) break
    }
    return out
  }
  return {
    projects: () => all("/projects"),
    sections: (projectId) => all(`/sections?project_id=${encodeURIComponent(projectId)}`),
    tasks: (projectId) => all(`/tasks?project_id=${encodeURIComponent(projectId)}`),
    task: (id) => call("GET", `/tasks/${encodeURIComponent(id)}`),
    create: (body, requestId) => call("POST", "/tasks", body, requestId),
    update: (id, body) => call("POST", `/tasks/${encodeURIComponent(id)}`, body),
  }
}

// ── Run ──────────────────────────────────────────────────────────────────────

export async function syncTodoist({ api = API, dryRun = false, client, now = new Date().toISOString() } = {}) {
  const today = bogotaToday(new Date(now))
  const token = client ? null : await todoistToken()
  if (!client && !token) return { skipped: "no Todoist token (env TODOIST_API_TOKEN or Keychain cortex-todoist)" }
  const td = client ?? todoistClient(token)

  const project = (await td.projects()).find((p) => String(p.name).trim().toLowerCase() === PROJECT.toLowerCase() && !p.is_archived)
  if (!project) return { skipped: `no "${PROJECT}" project in Todoist (never created automatically)` }
  const [sectionList, tasks, opp, alerts, readinessRaw] = await Promise.all([
    td.sections(project.id).catch(() => []), td.tasks(project.id),
    readKey(api, OPP_KEY), readKey(api, ALERTS_KEY), readKey(api, TRAVEL_READINESS_KEY),
  ])
  const sections = Object.fromEntries(sectionList.map((s) => [s.id, s.name]))
  const items = Array.isArray(opp.data?.items) ? opp.data.items : []
  const readiness = readinessRaw.data ? readinessOf(readinessRaw.data) : DEFAULT_TRAVEL_READINESS

  const actionable = new Map()
  for (const a of normalizeAlertStore(alerts.data).alerts) {
    if (a.state === "expired") continue
    const seen = actionable.get(a.opportunityId)
    // Newest first; an Apply/Prepare alert beats a newer Verify/Skip one for task creation.
    if (!seen || (!ACTIONABLE.has(seen.card?.action) && ACTIONABLE.has(a.card?.action))) actionable.set(a.opportunityId, a)
  }
  const activeIds = new Set(tasks.map((t) => String(t.id)))
  const linked = new Map()
  for (const o of items.filter((x) => x.todoistTaskId && !activeIds.has(String(x.todoistTaskId))).slice(0, MAX_LINK_LOOKUPS)) {
    linked.set(String(o.todoistTaskId), await td.task(o.todoistTaskId))
  }

  const plan = planTodoistSync({ items, tasks, sections, linked, actionable, readiness, today, projectId: project.id })
  const counts = `${plan.links.filter((l) => l.premium).length} marked premium · ${plan.imports.length} imported · ${plan.creates.length} created · ${plan.updates.length} updated`
  if (dryRun) return { dryRun: true, summary: counts, plan }

  const createdLinks = []
  for (const u of plan.updates) await td.update(u.taskId, u.body)
  for (const c of plan.creates) {
    const t = await td.create(c.body, `cortex-${c.oppId}`)
    if (t?.id) createdLinks.push({ oppId: c.oppId, taskId: String(t.id) })
  }
  if (plan.links.length || plan.imports.length || createdLinks.length) {
    await mutateKey(api, OPP_KEY, (current) => ({ value: applyPlanToStore(current ?? { items: [], lastRun: null }, plan, createdLinks, now) }))
  }
  return { summary: counts, plan: { ...plan, imports: plan.imports.map((r) => r.title) } }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  syncTodoist({ dryRun: process.argv.includes("--dry") })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error("todoist-sync FATAL:", e.message); process.exit(1) })
}
