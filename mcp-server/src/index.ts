import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage } from "http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  buildMaterialsIndex,
  indexMaterialIncremental,
  searchMaterialsIndex,
  type SearchMaterial,
} from "./search.js";

const BASE = process.env.CORTEX_API || "http://localhost:3456";

// ─── Helpers ──────────────────────────────────────────────

async function cortexGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Cortex ${res.status}: ${await res.text()}`);
  return res.json();
}

async function cortexPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Cortex ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Thrown by writeKey on HTTP 409 — carries the server's current value + rev. */
class ConflictError extends Error {
  constructor(public rev: string | null, public data: unknown, public hasData: boolean) {
    super("Cortex 409: write conflict");
  }
}

/**
 * Thrown inside a mutateKey callback to skip the write and make `result` the
 * tool's return value (soft errors like "not found" — never an exception).
 */
class MutationAbort extends Error {
  constructor(public result: unknown) {
    super("mutation aborted");
  }
}

/** Sentinel a mutateKey callback can return to skip the write entirely. */
const NO_WRITE = Symbol("no-write");

async function readKeyWithRev<T = unknown>(key: string): Promise<{ data: T | null; rev: string | null }> {
  const res = await fetch(`${BASE}/api/data?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`Cortex ${res.status}: ${await res.text()}`);
  const rev = res.headers.get("x-cortex-rev");
  return { data: (await res.json()) as T | null, rev };
}

async function readKey<T = unknown>(key: string): Promise<T> {
  return (await readKeyWithRev<T>(key)).data as T;
}

async function writeKey(key: string, data: unknown, baseRev?: string | null): Promise<void> {
  const res = await fetch(`${BASE}/api/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(baseRev != null ? { key, data, baseRev } : { key, data }),
  });
  if (res.status === 409) {
    let body: { rev?: string | null; data?: unknown } | null = null;
    try { body = (await res.json()) as { rev?: string | null; data?: unknown }; } catch { /* keep null */ }
    throw new ConflictError(body?.rev ?? null, body ? body.data : undefined, body != null);
  }
  if (!res.ok) throw new Error(`Cortex ${res.status}: ${await res.text()}`);
}

/**
 * Optimistic-concurrency read-modify-write: read (capturing X-Cortex-Rev) →
 * fn → write with baseRev. On a 409 conflict the server's current value
 * becomes the new base and fn re-runs, up to 3 retries. fn MUST be safe to
 * re-run against fresh data. Return NO_WRITE from fn to skip the write, or
 * throw MutationAbort to skip it AND set the tool result.
 */
async function mutateKey<T>(
  key: string,
  fn: (current: T) => T | typeof NO_WRITE | Promise<T | typeof NO_WRITE>,
  fallback: T,
): Promise<T> {
  let { data, rev } = await readKeyWithRev<T>(key);
  for (let attempt = 0; ; attempt++) {
    const base = (data ?? fallback) as T;
    const next = await fn(base);
    if (next === NO_WRITE) return base;
    try {
      await writeKey(key, next, rev);
      return next;
    } catch (e) {
      if (e instanceof ConflictError && attempt < 3) {
        if (e.hasData) { data = e.data as T | null; rev = e.rev; }
        else ({ data, rev } = await readKeyWithRev<T>(key));
        continue;
      }
      throw e;
    }
  }
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function uid(prefix = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function err(msg: string): ToolResult {
  return { content: [{ type: "text", text: msg }], isError: true };
}

async function run<T>(fn: () => Promise<T>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e: unknown) {
    if (e instanceof MutationAbort) return ok(e.result); // soft result (e.g. "not found"), not an error
    const error = e as Error & { cause?: { code?: string } };
    if (error?.cause?.code === "ECONNREFUSED" || error?.message?.includes("ECONNREFUSED")) {
      return err("Cortex app is not running. Start the Cortex Electron app first (it hosts the API on localhost:3456).");
    }
    return err(`Error: ${error?.message ?? e}`);
  }
}

// ─── Server ──────────────────────────────────────────────

const server = new McpServer(
  {
    name: "cortex",
    version: "1.0.0",
    description: "Personal dashboard for auditing your days — habits, books, captures, CRM, calendar, GTM, finance, gym, nutrition, opportunities, and more.",
  },
  {
    instructions: [
      "Cortex is Pablo's personal command-center dashboard (an Electron desktop app with a local web API). These tools read and write his REAL data, so the Cortex app must be running (it hosts the API on localhost:3456).",
      "",
      "Be proactive about capturing what Pablo says to the right surface — but ASK before writing unless he clearly told you to save it:",
      "- When he shares a THOUGHT, idea, reflection, realization, or opinion worth keeping, offer to save it with add_thought (e.g. \"Want me to save that as a thought in Cortex?\"). Don't save silently.",
      "- A quick note / link / thing to revisit later → add_capture. A book → add_book. A person or lead → add_contact / add_crm_contact. A calendar event → create_event.",
      "- A grocery bill or receipt → add_bill (it fills the Market week, creates Nutrition pantry items, and deducts the total from the Finances food budget). What he ate → log_ate. A meal template → create_meal_template. A shopping list from past buys → build_market_list.",
      "- Opportunities (fellowships, grants, accelerators, programs, residencies, hackathons, internships): get_opportunities to read the radar + active hunt orders (filter by category or deadline_type); add_opportunities to add ones you researched yourself (personalize using scripts/radar-profile.md and active hunt orders; include the deadline-intelligence fields); run_opportunity_radar to trigger the native scraper; set_hunt_order to steer it. The curated program catalog seeds via `node scripts/radar-seed-programs.mjs --write`.",
      "- Study sessions: when he names a subject (\"I'm working on Cálculo 3\", \"/sgd homework\"), call get_study_context FIRST — it bundles course, schedule, grades, assignments, topics, materials, and past notes. When he states a durable fact, decision, or prof constraint mid-session, OFFER save_study_note (ask unless he said to save it). A file or link he shares for a class → add_class_material (disk path, or content_base64 for chat attachments); file contents come back via read_class_material (downloads to a temp path for Reading). To FIND something across materials by meaning (\"cuando es el debate de migracion\") use search_class_materials; it needs an index built once via index_class_materials (kept fresh automatically as materials are added).",
      "",
      "Prefer domain-specific tools over the generic read_data / write_data. Confirm before overwriting existing data. Values are stored per calendar day/week under keys like cortex-nutrition-YYYY-MM-DD and cortex-market-<mondayDate>; today's date is the default when omitted.",
    ].join("\n"),
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 1: Daily Workflow
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_daily_sessions",
  "Get sprint/focus sessions for a given day",
  { date: z.string().optional().describe("YYYY-MM-DD, defaults to today") },
  async ({ date }) => run(() => readKey(`cortex-daily-sessions-${date || today()}`))
);

server.tool(
  "log_sprint_session",
  "Log a completed focus sprint session",
  {
    date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    task: z.string().describe("What was worked on"),
    duration: z.number().describe("Duration in minutes"),
    startedAt: z.string().optional().describe("ISO timestamp"),
    completedAt: z.string().optional().describe("ISO timestamp"),
  },
  async ({ date, task, duration, startedAt, completedAt }) => run(async () => {
    const d = date || today();
    const key = `cortex-daily-sessions-${d}`;
    const session = {
      id: uid("session"),
      task,
      duration,
      startedAt: startedAt || new Date().toISOString(),
      completedAt: completedAt || new Date().toISOString(),
    };
    await mutateKey<unknown[]>(key, (sessions) => {
      sessions.push(session);
      return sessions;
    }, []);
    return { ok: true, session };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 2: Habits
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_habits",
  "List all habit definitions (name, emoji, category, weekly goal)",
  {},
  async () => run(() => readKey("cortex-habits"))
);

server.tool(
  "get_habit_status",
  "Get habit completion grid for recent days",
  {
    date: z.string().optional().describe("Center date YYYY-MM-DD, defaults to today"),
    days: z.number().optional().describe("Number of days to look back (default 7)"),
  },
  async ({ date, days }) => run(async () => {
    const history = ((await readKey("cortex-habits-history")) || {}) as Record<string, Record<string, boolean>>;
    const d = new Date(date || today());
    const n = days || 7;
    const result: Record<string, Record<string, boolean>> = {};
    for (let i = 0; i < n; i++) {
      const dt = new Date(d);
      dt.setDate(dt.getDate() - i);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      if (history[key]) result[key] = history[key];
    }
    return result;
  })
);

server.tool(
  "toggle_habit",
  "Mark a habit as done or undone for a specific date",
  {
    habitId: z.string().describe("Habit ID"),
    date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    done: z.boolean().optional().describe("true to complete, false to uncomplete (default true)"),
  },
  async ({ habitId, date, done }) => run(async () => {
    const d = date || today();
    const value = done ?? true;
    await mutateKey<Record<string, Record<string, boolean>>>("cortex-habits-history", (history) => {
      if (!history[d]) history[d] = {};
      history[d][habitId] = value;
      return history;
    }, {});
    return { ok: true, date: d, habitId, done: value };
  })
);

server.tool(
  "get_habit_streak",
  "Calculate current streak and completion rate for a habit over the last N days",
  {
    habitId: z.string().describe("Habit ID"),
    days: z.number().optional().describe("Lookback days (default 30)"),
  },
  async ({ habitId, days }) => run(async () => {
    const history = ((await readKey("cortex-habits-history")) || {}) as Record<string, Record<string, boolean>>;
    const n = days || 30;
    let streak = 0;
    let completed = 0;
    const d = new Date(today());
    for (let i = 0; i < n; i++) {
      const dt = new Date(d);
      dt.setDate(dt.getDate() - i);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const done = history[key]?.[habitId] ?? false;
      if (done) completed++;
      if (i === streak && done) streak++;
    }
    return { habitId, streak, completed, total: n, rate: `${Math.round((completed / n) * 100)}%` };
  })
);

interface HabitDef {
  id: string;
  name: string;
  emoji: string;
  category?: string;
  cadence?: "weekly" | "monthly";
  weeklyGoal?: number; // days per week for 100% (weekly cadence), clamped 0–7 (0 = no target)
  monthlyGoal?: number; // days per month for 100% (monthly cadence), clamped 0–31 (0 = no target)
  context?: string; // free-form note: what the habit means + what counts as done
}

// Clamp a goal to the valid range for its cadence, mirroring the Habits UI.
// A goal of 0 is allowed — it means the habit has no required completions this
// window (paused / optional). `?? default` only fills an omitted goal, so an
// explicit 0 passes through (unlike `|| default`, which would coerce it away).
function clampHabitGoal(cadence: "weekly" | "monthly", raw: number | undefined): number {
  if (cadence === "monthly") return Math.min(Math.max(Math.round(raw ?? 1), 0), 31);
  return Math.min(Math.max(Math.round(raw ?? 7), 0), 7);
}

server.tool(
  "add_habit",
  "Create a new habit definition (mirrors the Habits page). Weekly habits use weeklyGoal (days/week, 1–7); monthly habits use monthlyGoal (days/month, 1–31).",
  {
    name: z.string().describe("Habit name"),
    emoji: z.string().optional().describe("Emoji icon, defaults to ⭐"),
    category: z.string().optional().describe("Category, e.g. Health, GTM, Mind"),
    cadence: z.enum(["weekly", "monthly"]).optional().describe("Cadence, defaults to weekly"),
    goal: z.number().optional().describe("Target completions per window (per week for weekly, per month for monthly). Weekly defaults to 7, monthly to 1. 0 = no target this window (paused/optional, still trackable)."),
    context: z.string().optional().describe("Free-form note explaining what the habit really means and exactly what counts as done."),
  },
  async ({ name, emoji, category, cadence, goal, context }) => run(async () => {
    if (!name.trim()) throw new Error("Habit name is required.");
    const cad = cadence ?? "weekly";
    const habit: HabitDef = {
      id: Date.now().toString(),
      name: name.trim(),
      emoji: emoji || "⭐",
      ...(category ? { category } : {}),
      cadence: cad,
      ...(cad === "monthly"
        ? { monthlyGoal: clampHabitGoal("monthly", goal) }
        : { weeklyGoal: clampHabitGoal("weekly", goal) }),
      ...(context && context.trim() ? { context: context.trim() } : {}),
    };
    await mutateKey<HabitDef[]>("cortex-habits", (habits) => {
      habits.push(habit);
      return habits;
    }, []);
    return { ok: true, habit };
  })
);

server.tool(
  "update_habit",
  "Edit an existing habit definition by id. Only the fields you pass are changed. Changing cadence (or passing goal) re-normalizes the weekly/monthly goal. Pass an empty string for category to clear it.",
  {
    habitId: z.string().describe("Habit ID (from get_habits)"),
    name: z.string().optional().describe("New name"),
    emoji: z.string().optional().describe("New emoji"),
    category: z.string().optional().describe("New category; empty string clears it"),
    cadence: z.enum(["weekly", "monthly"]).optional().describe("Switch cadence (weekly/monthly)"),
    goal: z.number().optional().describe("New target completions per window. 0 = no target this window (paused/optional, still trackable)."),
    context: z.string().optional().describe("Free-form note explaining what the habit means and what counts as done; empty string clears it."),
  },
  async ({ habitId, name, emoji, category, cadence, goal, context }) => run(async () => {
    let updated: HabitDef | undefined;
    await mutateKey<HabitDef[]>("cortex-habits", (habits) => {
      const idx = habits.findIndex((h) => h.id === habitId);
      if (idx === -1) throw new Error(`No habit found with id "${habitId}". Use get_habits to list ids.`);
      const habit = { ...habits[idx] };
      if (name !== undefined) {
        if (!name.trim()) throw new Error("Habit name cannot be empty.");
        habit.name = name.trim();
      }
      if (emoji !== undefined && emoji) habit.emoji = emoji;
      if (category !== undefined) {
        if (category) habit.category = category;
        else delete habit.category;
      }
      if (context !== undefined) {
        if (context.trim()) habit.context = context.trim();
        else delete habit.context;
      }
      // Re-normalize goal fields only when cadence or goal is provided (matches the UI's edit save).
      if (cadence !== undefined || goal !== undefined) {
        const cad = cadence ?? habit.cadence ?? "weekly";
        habit.cadence = cad;
        if (cad === "monthly") {
          habit.monthlyGoal = clampHabitGoal("monthly", goal ?? habit.monthlyGoal);
          delete habit.weeklyGoal;
        } else {
          habit.weeklyGoal = clampHabitGoal("weekly", goal ?? habit.weeklyGoal);
          delete habit.monthlyGoal;
        }
      }
      habits[idx] = habit;
      updated = habit;
      return habits;
    }, []);
    return { ok: true, habit: updated };
  })
);

server.tool(
  "delete_habit",
  "Delete a habit definition by id and remove its completion history (mirrors removing a habit on the Habits page).",
  {
    habitId: z.string().describe("Habit ID (from get_habits)"),
  },
  async ({ habitId }) => run(async () => {
    let removed: HabitDef | undefined;
    await mutateKey<HabitDef[]>("cortex-habits", (habits) => {
      removed = habits.find((h) => h.id === habitId);
      if (!removed) throw new Error(`No habit found with id "${habitId}". Use get_habits to list ids.`);
      return habits.filter((h) => h.id !== habitId);
    }, []);
    // Clean completion history so streaks/scores don't count a deleted habit.
    await mutateKey<Record<string, Record<string, boolean>>>("cortex-habits-history", (history) => {
      let touched = false;
      for (const date of Object.keys(history)) {
        if (history[date] && habitId in history[date]) {
          delete history[date][habitId];
          touched = true;
        }
      }
      return touched ? history : NO_WRITE;
    }, {});
    // Clean the legacy weekly grid too, in case it still holds this id.
    await mutateKey<Record<string, unknown>>("cortex-habits-grid", (grid) => {
      if (!(habitId in grid)) return NO_WRITE;
      delete grid[habitId];
      return grid;
    }, {});
    return { ok: true, deleted: removed };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 2c: Goals (outcome goals + milestones, stored in cortex-goals)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type GoalStatus = "active" | "done" | "archived";
interface Milestone { id: string; title: string; done: boolean }
interface GoalDef {
  id: string;
  title: string;
  detail?: string; // the "why" / notes
  area?: string; // life area (Startup, Growth, Health…)
  period?: string; // "2026" | "2026-Q3" | "2026-07"
  targetDate?: string; // YYYY-MM-DD deadline
  progress?: number; // 0–100, used only when there are no milestones
  milestones?: Milestone[]; // when present, progress = done/total
  status: GoalStatus;
  createdAt: string;
  completedAt?: string;
}

// Mirror of goalProgress() in src/features/goals/GoalsPage.tsx.
function computeGoalProgress(g: GoalDef): number {
  if (g.status === "done") return 100;
  if (g.milestones && g.milestones.length > 0) {
    const done = g.milestones.filter((m) => m.done).length;
    return Math.round((done / g.milestones.length) * 100);
  }
  return Math.min(Math.max(g.progress ?? 0, 0), 100);
}

const withPct = (g: GoalDef) => ({ ...g, pct: computeGoalProgress(g) });

server.tool(
  "get_goals",
  "List all goals with computed progress % (derived from milestones, or the manual percent). Includes a summary of active/done counts and average progress.",
  {
    includeArchived: z.boolean().optional().describe("Include archived goals (default false)"),
  },
  async ({ includeArchived }) => run(async () => {
    const goals = ((await readKey("cortex-goals")) || []) as GoalDef[];
    const shown = includeArchived ? goals : goals.filter((g) => g.status !== "archived");
    const active = goals.filter((g) => g.status === "active");
    const avg = active.length ? Math.round(active.reduce((s, g) => s + computeGoalProgress(g), 0) / active.length) : 0;
    return {
      goals: shown.map(withPct),
      summary: { active: active.length, done: goals.filter((g) => g.status === "done").length, archived: goals.filter((g) => g.status === "archived").length, avgProgress: avg },
    };
  })
);

server.tool(
  "add_goal",
  "Create a new goal. Optionally give it milestones (a checklist) — when a goal has milestones its progress is auto-computed from them; otherwise use the manual `progress` percent.",
  {
    title: z.string().describe("What to achieve"),
    detail: z.string().optional().describe("Why it matters / notes"),
    area: z.string().optional().describe("Life area, e.g. Startup, Growth, Health"),
    period: z.string().optional().describe("Timeframe label: '2026', '2026-Q3', or '2026-07'"),
    targetDate: z.string().optional().describe("Deadline, YYYY-MM-DD"),
    progress: z.number().optional().describe("Manual progress 0–100 (ignored if milestones are set)"),
    milestones: z.array(z.string()).optional().describe("Checklist steps (titles); all start unchecked"),
    status: z.enum(["active", "done", "archived"]).optional().describe("Defaults to active"),
  },
  async ({ title, detail, area, period, targetDate, progress, milestones, status }) => run(async () => {
    if (!title.trim()) throw new Error("Goal title is required.");
    const st = status ?? "active";
    const goal: GoalDef = {
      id: uid("goal"),
      title: title.trim(),
      status: st,
      createdAt: new Date().toISOString(),
      progress: Math.min(Math.max(progress ?? 0, 0), 100),
      ...(detail ? { detail } : {}),
      ...(area ? { area } : {}),
      ...(period ? { period } : {}),
      ...(targetDate ? { targetDate } : {}),
      ...(milestones && milestones.length ? { milestones: milestones.map((t) => ({ id: uid("ms"), title: t, done: false })) } : {}),
      ...(st === "done" ? { completedAt: new Date().toISOString() } : {}),
    };
    await mutateKey<GoalDef[]>("cortex-goals", (goals) => {
      goals.push(goal);
      return goals;
    }, []);
    return { ok: true, goal: withPct(goal) };
  })
);

server.tool(
  "update_goal",
  "Edit a goal by id. Only passed fields change. Pass an empty string to clear detail/area/period/targetDate. Passing `milestones` REPLACES the whole checklist. Setting status to done stamps completedAt; leaving done clears it.",
  {
    goalId: z.string().describe("Goal id (from get_goals)"),
    title: z.string().optional(),
    detail: z.string().optional().describe("Empty string clears it"),
    area: z.string().optional().describe("Empty string clears it"),
    period: z.string().optional().describe("Empty string clears it"),
    targetDate: z.string().optional().describe("YYYY-MM-DD; empty string clears it"),
    progress: z.number().optional().describe("Manual progress 0–100 (ignored if milestones exist)"),
    status: z.enum(["active", "done", "archived"]).optional(),
    milestones: z.array(z.object({ title: z.string(), done: z.boolean().optional() })).optional().describe("Replaces the entire milestone list"),
  },
  async ({ goalId, title, detail, area, period, targetDate, progress, status, milestones }) => run(async () => {
    let updated: GoalDef | undefined;
    await mutateKey<GoalDef[]>("cortex-goals", (goals) => {
      const idx = goals.findIndex((g) => g.id === goalId);
      if (idx === -1) throw new Error(`No goal found with id "${goalId}". Use get_goals to list ids.`);
      const g = { ...goals[idx] };
      if (title !== undefined) {
        if (!title.trim()) throw new Error("Goal title cannot be empty.");
        g.title = title.trim();
      }
      const setOrClear = (key: "detail" | "area" | "period" | "targetDate", val: string | undefined) => {
        if (val === undefined) return;
        if (val) g[key] = val;
        else delete g[key];
      };
      setOrClear("detail", detail);
      setOrClear("area", area);
      setOrClear("period", period);
      setOrClear("targetDate", targetDate);
      if (progress !== undefined) g.progress = Math.min(Math.max(progress, 0), 100);
      if (milestones !== undefined) g.milestones = milestones.map((m) => ({ id: uid("ms"), title: m.title, done: m.done ?? false }));
      if (status !== undefined) {
        g.status = status;
        if (status === "done") g.completedAt = g.completedAt ?? new Date().toISOString();
        else delete g.completedAt;
      }
      goals[idx] = g;
      updated = g;
      return goals;
    }, []);
    return { ok: true, goal: withPct(updated!) };
  })
);

server.tool(
  "toggle_goal_milestone",
  "Check or uncheck one milestone on a goal (this is how you record progress on a milestone-based goal).",
  {
    goalId: z.string().describe("Goal id"),
    milestoneId: z.string().describe("Milestone id (from get_goals)"),
    done: z.boolean().optional().describe("true to check, false to uncheck; omit to toggle"),
  },
  async ({ goalId, milestoneId, done }) => run(async () => {
    let updated: GoalDef | undefined;
    await mutateKey<GoalDef[]>("cortex-goals", (goals) => {
      const g = goals.find((x) => x.id === goalId);
      if (!g) throw new Error(`No goal found with id "${goalId}".`);
      const m = (g.milestones ?? []).find((x) => x.id === milestoneId);
      if (!m) throw new Error(`No milestone "${milestoneId}" on goal "${goalId}".`);
      m.done = done ?? !m.done;
      updated = g;
      return goals;
    }, []);
    return { ok: true, goal: withPct(updated!) };
  })
);

server.tool(
  "delete_goal",
  "Delete a goal by id.",
  { goalId: z.string().describe("Goal id (from get_goals)") },
  async ({ goalId }) => run(async () => {
    let removed: GoalDef | undefined;
    await mutateKey<GoalDef[]>("cortex-goals", (goals) => {
      removed = goals.find((g) => g.id === goalId);
      if (!removed) throw new Error(`No goal found with id "${goalId}". Use get_goals to list ids.`);
      return goals.filter((g) => g.id !== goalId);
    }, []);
    return { ok: true, deleted: removed };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 2b: Class schedule (weekly classes → purple calendar events)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ClassDef {
  id: string;
  courseId: string;
  courseName: string;
  days: number[];    // 0=Mon … 6=Sun
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  room?: string;
  termStart: string; // "YYYY-MM-DD"
  termEnd: string;   // "YYYY-MM-DD"
}

const CLASS_TERM_START = "2026-07-15";
const CLASS_TERM_END = "2026-11-28";
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // 0=Mon
const DAY_INDEX: Record<string, number> = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4,
  sat: 5, saturday: 5, sun: 6, sunday: 6,
};

// Accept day names ('Mon','monday') or numbers (0=Mon) → sorted unique 0–6 indexes.
function parseDays(days: (string | number)[]): number[] {
  const out = new Set<number>();
  for (const d of days) {
    if (typeof d === "number") { if (d >= 0 && d <= 6) out.add(d); continue; }
    const idx = DAY_INDEX[String(d).trim().toLowerCase()];
    if (idx !== undefined) out.add(idx);
  }
  return [...out].sort((a, b) => a - b);
}

// Loose slug for courseId (an internal link id, never displayed) — courseName
// carries the real title, so we don't need perfect diacritic handling here.
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "course";
}

const isHHMM = (s: string) => /^\d{1,2}:\d{2}$/.test(s);
const withDayNames = (c: ClassDef) => ({ ...c, dayNames: c.days.map((d) => DAY_NAMES[d]) });

server.tool(
  "get_classes",
  "List the saved weekly class schedule (course, meeting days/times, room, term). Classes sync to the calendar as purple weekly-recurring events.",
  {},
  async () => run(async () => {
    const classes = ((await readKey("cortex-classes")) || []) as ClassDef[];
    return classes.map(withDayNames);
  })
);

server.tool(
  "add_class",
  "Add a weekly class to the schedule. Saves to Cortex and syncs to the calendar as a purple weekly-recurring event (BYDAY across its days, until term end). The event appears on the app's next reconcile — immediately on app restart, or within a few minutes while it's running. Days accept names ('Mon','Wed' or 'monday'); times are 24h 'HH:MM'.",
  {
    courseName: z.string().describe("Course name, e.g. 'Cálculo 3' — used as the calendar event title"),
    days: z.array(z.string()).describe("Meeting days, e.g. ['Mon','Wed']"),
    startTime: z.string().describe("Start time, 24h 'HH:MM', e.g. '10:00'"),
    endTime: z.string().describe("End time, 24h 'HH:MM', e.g. '11:30'"),
    room: z.string().optional().describe("Room / location"),
    termStart: z.string().optional().describe(`Term start YYYY-MM-DD (default ${CLASS_TERM_START})`),
    termEnd: z.string().optional().describe(`Term end YYYY-MM-DD; recurrence stops here (default ${CLASS_TERM_END})`),
    courseId: z.string().optional().describe("Optional id linking to a Student-page course; defaults to a slug of courseName"),
  },
  async ({ courseName, days, startTime, endTime, room, termStart, termEnd, courseId }) => run(async () => {
    if (!courseName.trim()) throw new Error("courseName is required.");
    const parsedDays = parseDays(days);
    if (parsedDays.length === 0) throw new Error("At least one valid day is required, e.g. ['Mon','Wed'].");
    if (!isHHMM(startTime)) throw new Error("startTime must be 24h 'HH:MM', e.g. '10:00'.");
    if (!isHHMM(endTime)) throw new Error("endTime must be 24h 'HH:MM', e.g. '11:30'.");
    const cls: ClassDef = {
      id: uid("class"),
      courseId: courseId?.trim() || slugify(courseName),
      courseName: courseName.trim(),
      days: parsedDays,
      startTime,
      endTime,
      ...(room && room.trim() ? { room: room.trim() } : {}),
      termStart: termStart || CLASS_TERM_START,
      termEnd: termEnd || CLASS_TERM_END,
    };
    await mutateKey<ClassDef[]>("cortex-classes", (classes) => {
      classes.push(cls);
      return classes;
    }, []);
    return { ok: true, class: withDayNames(cls) };
  })
);

server.tool(
  "update_class",
  "Edit a saved class by id. Only the fields you pass change. Empty string for room clears it.",
  {
    classId: z.string().describe("Class ID (from get_classes)"),
    courseName: z.string().optional(),
    days: z.array(z.string()).optional().describe("Meeting days, e.g. ['Mon','Wed']"),
    startTime: z.string().optional().describe("24h 'HH:MM'"),
    endTime: z.string().optional().describe("24h 'HH:MM'"),
    room: z.string().optional().describe("Room; empty string clears it"),
    termStart: z.string().optional().describe("YYYY-MM-DD"),
    termEnd: z.string().optional().describe("YYYY-MM-DD"),
  },
  async ({ classId, courseName, days, startTime, endTime, room, termStart, termEnd }) => run(async () => {
    let updated: ClassDef | undefined;
    await mutateKey<ClassDef[]>("cortex-classes", (classes) => {
      const idx = classes.findIndex((c) => c.id === classId);
      if (idx === -1) throw new Error(`No class found with id "${classId}". Use get_classes to list ids.`);
      const c = { ...classes[idx] };
      if (courseName !== undefined) { if (!courseName.trim()) throw new Error("courseName cannot be empty."); c.courseName = courseName.trim(); }
      if (days !== undefined) { const p = parseDays(days); if (p.length === 0) throw new Error("At least one valid day is required."); c.days = p; }
      if (startTime !== undefined) { if (!isHHMM(startTime)) throw new Error("startTime must be 24h 'HH:MM'."); c.startTime = startTime; }
      if (endTime !== undefined) { if (!isHHMM(endTime)) throw new Error("endTime must be 24h 'HH:MM'."); c.endTime = endTime; }
      if (room !== undefined) { if (room.trim()) c.room = room.trim(); else delete c.room; }
      if (termStart !== undefined) c.termStart = termStart;
      if (termEnd !== undefined) c.termEnd = termEnd;
      classes[idx] = c;
      updated = c;
      return classes;
    }, []);
    return { ok: true, class: withDayNames(updated!) };
  })
);

server.tool(
  "delete_class",
  "Delete a saved class by id. Its purple calendar event is removed on the app's next reconcile.",
  { classId: z.string().describe("Class ID (from get_classes)") },
  async ({ classId }) => run(async () => {
    let removed: ClassDef | undefined;
    await mutateKey<ClassDef[]>("cortex-classes", (classes) => {
      removed = classes.find((c) => c.id === classId);
      if (!removed) throw new Error(`No class found with id "${classId}". Use get_classes to list ids.`);
      return classes.filter((c) => c.id !== classId);
    }, []);
    return { ok: true, deleted: removed };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 3: Books
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_books",
  "List all books with optional status/genre filter",
  {
    status: z.string().optional().describe("Filter: 'Sin empezar', 'En curso', 'Hecho'"),
    genre: z.string().optional().describe("Filter by genre"),
    search: z.string().optional().describe("Search in title/author"),
  },
  async ({ status, genre, search }) => run(async () => {
    let books = ((await readKey("cortex-books")) || []) as Record<string, unknown>[];
    if (status) books = books.filter(b => b.status === status);
    if (genre) books = books.filter(b => (b.genre as string)?.toLowerCase().includes(genre.toLowerCase()));
    if (search) {
      const q = search.toLowerCase();
      books = books.filter(b =>
        (b.title as string)?.toLowerCase().includes(q) ||
        (b.author as string)?.toLowerCase().includes(q)
      );
    }
    return books;
  })
);

server.tool(
  "add_book",
  "Add a new book to the reading list",
  {
    title: z.string(),
    author: z.string(),
    status: z.string().optional().describe("'Sin empezar' | 'En curso' | 'Hecho' (default: 'Sin empezar')"),
    genre: z.string().optional(),
    notes: z.string().optional(),
    language: z.string().optional().describe("'en' or 'es'"),
  },
  async ({ title, author, status, genre, notes, language }) => run(async () => {
    const book = {
      id: uid("book"),
      title,
      author,
      status: status || "Sin empezar",
      genre: genre || "",
      score: "",
      notes: notes || "",
      language: language || "en",
      start: "",
      finished: "",
    };
    await mutateKey<unknown[]>("cortex-books", (books) => {
      books.push(book);
      return books;
    }, []);
    return { ok: true, book };
  })
);

server.tool(
  "update_book",
  "Update a book's status, score, notes, or other fields",
  {
    id: z.string().describe("Book ID"),
    status: z.string().optional(),
    score: z.string().optional().describe("Rating like '8/10'"),
    notes: z.string().optional(),
    genre: z.string().optional(),
    start: z.string().optional().describe("Date started reading"),
    finished: z.string().optional().describe("Date finished"),
  },
  async ({ id, ...updates }) => run(async () => {
    let updated: Record<string, unknown> | undefined;
    await mutateKey<Record<string, unknown>[]>("cortex-books", (books) => {
      const book = books.find(b => b.id === id);
      if (!book) throw new MutationAbort({ error: `Book ${id} not found` });
      Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) book[k] = v; });
      updated = book;
      return books;
    }, []);
    return { ok: true, book: updated };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 4: Captures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_captures",
  "List saved captures (articles, tweets, screenshots, etc) with optional filters",
  {
    source: z.string().optional().describe("Filter by source: x, tiktok, linkedin, reddit, article, screenshot, other"),
    search: z.string().optional().describe("Search in title/content"),
    limit: z.number().optional().describe("Max results (default all)"),
  },
  async ({ source, search, limit }) => run(async () => {
    let caps = ((await readKey("cortex-captures")) || []) as Record<string, unknown>[];
    if (source) caps = caps.filter(c => c.source === source);
    if (search) {
      const q = search.toLowerCase();
      caps = caps.filter(c =>
        (c.title as string)?.toLowerCase().includes(q) ||
        (c.content as string)?.toLowerCase().includes(q)
      );
    }
    if (limit) caps = caps.slice(0, limit);
    return caps;
  })
);

server.tool(
  "add_capture",
  "Save a new content capture (article, tweet, screenshot note, etc)",
  {
    title: z.string(),
    content: z.string().describe("Markdown content"),
    source: z.string().describe("Source: x, tiktok, linkedin, reddit, article, screenshot, other"),
    url: z.string().optional(),
  },
  async ({ title, content, source, url }) => run(async () => {
    const capture = {
      id: uid("cap"),
      title,
      content,
      source,
      url: url || "",
      images: [],
      createdAt: new Date().toISOString(),
    };
    await mutateKey<unknown[]>("cortex-captures", (caps) => {
      caps.push(capture);
      return caps;
    }, []);
    return { ok: true, capture };
  })
);

server.tool(
  "delete_capture",
  "Delete a capture by ID",
  { id: z.string() },
  async ({ id }) => run(async () => {
    await mutateKey<Record<string, unknown>[]>("cortex-captures", (caps) => {
      const filtered = caps.filter(c => c.id !== id);
      if (filtered.length === caps.length) throw new MutationAbort({ error: `Capture ${id} not found` });
      return filtered;
    }, []);
    return { ok: true, deleted: id };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 5: Thoughts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_thoughts",
  "List all thoughts/insights with optional search",
  {
    search: z.string().optional().describe("Search in name/content"),
    topic: z.string().optional().describe("Filter by topic"),
    highValueOnly: z.boolean().optional().describe("Only show high-value thoughts"),
  },
  async ({ search, topic, highValueOnly }) => run(async () => {
    let thoughts = ((await readKey("cortex-thoughts")) || []) as Record<string, unknown>[];
    if (topic) thoughts = thoughts.filter(t => (t.topic as string)?.toLowerCase().includes(topic.toLowerCase()));
    if (highValueOnly) thoughts = thoughts.filter(t => t.highValue === true);
    if (search) {
      const q = search.toLowerCase();
      thoughts = thoughts.filter(t =>
        (t.name as string)?.toLowerCase().includes(q) ||
        (t.subline as string)?.toLowerCase().includes(q)
      );
    }
    return thoughts;
  })
);

server.tool(
  "add_thought",
  "Record a new thought, idea, or insight",
  {
    name: z.string().describe("Main thought/idea"),
    subline: z.string().optional().describe("Supporting detail or context"),
    topic: z.string().optional(),
    book: z.string().optional().describe("Related book if applicable"),
    highValue: z.boolean().optional().describe("Mark as high-value insight"),
  },
  async ({ name, subline, topic, book, highValue }) => run(async () => {
    const thought = {
      id: uid("thought"),
      name,
      subline: subline || "",
      topic: topic || "",
      book: book || "",
      highValue: highValue ?? false,
      createdAt: new Date().toISOString(),
    };
    await mutateKey<unknown[]>("cortex-thoughts", (thoughts) => {
      thoughts.push(thought);
      return thoughts;
    }, []);
    return { ok: true, thought };
  })
);

server.tool(
  "update_thought",
  "Update an existing thought's fields",
  {
    id: z.string(),
    name: z.string().optional(),
    subline: z.string().optional(),
    topic: z.string().optional(),
    book: z.string().optional(),
    highValue: z.boolean().optional(),
  },
  async ({ id, ...updates }) => run(async () => {
    let updated: Record<string, unknown> | undefined;
    await mutateKey<Record<string, unknown>[]>("cortex-thoughts", (thoughts) => {
      const thought = thoughts.find(t => t.id === id);
      if (!thought) throw new MutationAbort({ error: `Thought ${id} not found` });
      Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) thought[k] = v; });
      updated = thought;
      return thoughts;
    }, []);
    return { ok: true, thought: updated };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 6: Social Contacts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_contacts",
  "List personal contacts with optional category/follow-up filter",
  {
    category: z.string().optional().describe("Filter by category"),
    followUpDue: z.boolean().optional().describe("Only show contacts overdue for follow-up"),
    search: z.string().optional().describe("Search in name/notes"),
  },
  async ({ category, followUpDue, search }) => run(async () => {
    let contacts = ((await readKey("cortex-contacts")) || []) as Record<string, unknown>[];
    if (category) {
      contacts = contacts.filter(c => {
        const cats = c.categories as string[] | undefined;
        return cats?.some(cat => cat.toLowerCase().includes(category.toLowerCase()));
      });
    }
    if (followUpDue) {
      const now = Date.now();
      contacts = contacts.filter(c => {
        const interval = c.interval as number | undefined;
        const lastContact = c.lastContact as string | undefined;
        if (!interval || !lastContact) return false;
        const due = new Date(lastContact).getTime() + interval * 24 * 60 * 60 * 1000;
        return due < now;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      contacts = contacts.filter(c =>
        (c.name as string)?.toLowerCase().includes(q) ||
        (c.notes as string)?.toLowerCase().includes(q)
      );
    }
    return contacts;
  })
);

server.tool(
  "add_contact",
  "Add a new personal contact",
  {
    name: z.string(),
    categories: z.array(z.string()).optional(),
    birthday: z.string().optional().describe("YYYY-MM-DD"),
    phone: z.string().optional(),
    email: z.string().optional(),
    interval: z.number().optional().describe("Follow-up interval in days"),
    nickname: z.string().optional(),
    title: z.string().optional().describe("Role or title"),
    notes: z.string().optional(),
  },
  async ({ name, categories, birthday, phone, email, interval, nickname, title, notes }) => run(async () => {
    const contact = {
      id: uid("contact"),
      name,
      nickname: nickname || "",
      title: title || "",
      categories: categories || [],
      birthday: birthday || "",
      phone: phone || "",
      email: email || "",
      interval: interval || 0,
      lastContact: "",
      notes: notes || "",
    };
    await mutateKey<unknown[]>("cortex-contacts", (contacts) => {
      contacts.push(contact);
      return contacts;
    }, []);
    return { ok: true, contact };
  })
);

server.tool(
  "update_contact",
  "Update a contact's fields (also use to log a touchpoint by setting lastContact to today)",
  {
    id: z.string(),
    name: z.string().optional(),
    categories: z.array(z.string()).optional(),
    birthday: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    interval: z.number().optional(),
    nickname: z.string().optional(),
    title: z.string().optional(),
    notes: z.string().optional(),
    lastContact: z.string().optional().describe("YYYY-MM-DD of last contact"),
  },
  async ({ id, ...updates }) => run(async () => {
    let updated: Record<string, unknown> | undefined;
    await mutateKey<Record<string, unknown>[]>("cortex-contacts", (contacts) => {
      const contact = contacts.find(c => c.id === id);
      if (!contact) throw new MutationAbort({ error: `Contact ${id} not found` });
      Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) contact[k] = v; });
      updated = contact;
      return contacts;
    }, []);
    return { ok: true, contact: updated };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 7: CRM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_crm",
  "Get CRM organizations and contacts with optional status/search filter",
  {
    orgId: z.string().optional().describe("Filter to specific organization"),
    status: z.string().optional().describe("Filter contacts by status: lead, prospect, active, churned, paused"),
    search: z.string().optional().describe("Search in contact names/companies"),
  },
  async ({ orgId, status, search }) => run(async () => {
    const crm = (await readKey("cortex-crm")) as Record<string, unknown> | null;
    if (!crm) return { organizations: [] };
    let orgs = (crm.organizations || []) as Record<string, unknown>[];
    if (orgId) orgs = orgs.filter(o => o.id === orgId);
    if (status || search) {
      orgs = orgs.map(org => {
        let contacts = (org.contacts || []) as Record<string, unknown>[];
        if (status) contacts = contacts.filter(c => c.status === status);
        if (search) {
          const q = search.toLowerCase();
          contacts = contacts.filter(c =>
            (c.name as string)?.toLowerCase().includes(q) ||
            (c.company as string)?.toLowerCase().includes(q)
          );
        }
        return { ...org, contacts };
      }).filter(o => ((o.contacts as unknown[])?.length ?? 0) > 0);
    }
    return { organizations: orgs };
  })
);

server.tool(
  "add_crm_contact",
  "Add a new contact to a CRM organization",
  {
    orgId: z.string().describe("Organization ID"),
    name: z.string(),
    company: z.string().optional(),
    role: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    status: z.string().optional().describe("lead | prospect | active | churned | paused"),
    value: z.number().optional().describe("Deal value"),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
  },
  async ({ orgId, name, company, role, email, phone, status, value, notes, tags }) => run(async () => {
    const contact = {
      id: uid("crm"),
      name,
      company: company || "",
      role: role || "",
      email: email || "",
      phone: phone || "",
      status: status || "lead",
      value: value || 0,
      notes: notes || "",
      tags: tags || [],
      lastContact: "",
      createdAt: new Date().toISOString(),
    };
    await mutateKey<Record<string, unknown>>("cortex-crm", (crm) => {
      const orgs = (crm.organizations || []) as Record<string, unknown>[];
      const org = orgs.find(o => o.id === orgId);
      if (!org) throw new MutationAbort({ error: `Organization ${orgId} not found` });
      const contacts = (org.contacts || []) as unknown[];
      contacts.push(contact);
      org.contacts = contacts;
      return crm;
    }, { organizations: [] });
    return { ok: true, contact };
  })
);

server.tool(
  "update_crm_contact",
  "Update a CRM contact's status, value, notes, or other fields",
  {
    contactId: z.string(),
    name: z.string().optional(),
    company: z.string().optional(),
    role: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    status: z.string().optional(),
    value: z.number().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    lastContact: z.string().optional(),
  },
  async ({ contactId, ...updates }) => run(async () => {
    let updated: Record<string, unknown> | undefined;
    await mutateKey<Record<string, unknown>>("cortex-crm", (crm) => {
      const orgs = (crm.organizations || []) as Record<string, unknown>[];
      for (const org of orgs) {
        const contacts = (org.contacts || []) as Record<string, unknown>[];
        const contact = contacts.find(c => c.id === contactId);
        if (contact) {
          Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) contact[k] = v; });
          updated = contact;
          return crm;
        }
      }
      throw new MutationAbort({ error: `Contact ${contactId} not found in any organization` });
    }, { organizations: [] });
    return { ok: true, contact: updated };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 8: Calendar
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_today_events",
  "Get today's calendar events from Apple Calendar",
  {},
  async () => run(() => cortexGet("/api/calendar/today"))
);

server.tool(
  "get_events",
  "Get calendar events in a date range",
  {
    start: z.string().describe("Start date YYYY-MM-DD"),
    end: z.string().describe("End date YYYY-MM-DD"),
  },
  async ({ start, end }) => run(() => cortexGet(`/api/calendar/events?start=${start}&end=${end}`))
);

server.tool(
  "create_event",
  "Create a new calendar event in Apple Calendar",
  {
    title: z.string(),
    startDate: z.string().describe("ISO datetime"),
    endDate: z.string().optional().describe("ISO datetime"),
    isAllDay: z.boolean().optional(),
    calendar: z.string().optional().describe("Calendar name"),
    notes: z.string().optional(),
    recurrence: z.string().optional().describe("Recurrence rule"),
  },
  async (params) => run(() => cortexPost("/api/calendar/create", params))
);

server.tool(
  "update_event",
  "Update an existing calendar event",
  {
    eventId: z.string(),
    title: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    isAllDay: z.boolean().optional(),
    notes: z.string().optional(),
    recurrence: z.string().optional(),
  },
  async ({ eventId, ...updates }) => run(() =>
    cortexPost(`/api/calendar/update/${encodeURIComponent(eventId)}`, updates)
  )
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 9: GTM / Go-to-Market
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_gtm_state",
  "Get current GTM phase state (phase number, start dates, exit criteria) and recent history",
  {
    historyDays: z.number().optional().describe("Days of history to include (default 14)"),
  },
  async ({ historyDays }) => run(async () => {
    const state = await readKey("cortex-gtm-state");
    const history = ((await readKey("cortex-gtm-history")) || []) as Record<string, unknown>[];
    const n = historyDays || 14;
    return { state, recentHistory: history.slice(0, n) };
  })
);

server.tool(
  "get_gtm_log",
  "Get the GTM daily activity log (DMs, demos, posts, followers, etc)",
  { date: z.string().optional().describe("YYYY-MM-DD, defaults to today") },
  async ({ date }) => run(() => readKey(`cortex-gtm-log-${date || today()}`))
);

server.tool(
  "update_gtm_log",
  "Update GTM daily metrics (DMs sent, demo calls, posts published, etc)",
  {
    date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    dmsSent: z.number().optional(),
    dmResponses: z.number().optional(),
    demoCalls: z.number().optional(),
    xReplies: z.number().optional(),
    xFollowers: z.number().optional(),
    redditComments: z.number().optional(),
    linkedinMessages: z.number().optional(),
    postsPublished: z.number().optional(),
    channelOfSignup: z.string().optional(),
    notes: z.string().optional(),
  },
  async ({ date, ...metrics }) => run(async () => {
    const d = date || today();
    const key = `cortex-gtm-log-${d}`;
    const log = await mutateKey<Record<string, unknown>>(key, (existing) => {
      Object.entries(metrics).forEach(([k, v]) => { if (v !== undefined) existing[k] = v; });
      existing.date = d;
      return existing;
    }, {
      date: d, dmsSent: 0, dmResponses: 0, demoCalls: 0, xReplies: 0,
      xFollowers: 0, redditComments: 0, linkedinMessages: 0, postsPublished: 0,
      channelOfSignup: "", notes: "",
    });
    return { ok: true, log };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 10: Integrations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_github_stats",
  "Get GitHub activity stats (commits today/week, PRs, streak, top repos)",
  {},
  async () => run(() => cortexGet("/api/integrations/github"))
);

server.tool(
  "get_lemon_stats",
  "Get Lemon Squeezy revenue stats (MRR, total customers, churn)",
  {},
  async () => run(() => cortexGet("/api/integrations/lemon"))
);

server.tool(
  "get_vercel_stats",
  "Get Vercel deployment and traffic stats (deployments, pageviews)",
  {},
  async () => run(() => cortexGet("/api/integrations/vercel"))
);

server.tool(
  "get_supabase_stats",
  "Get Supabase user signup stats (total users, signups today/week)",
  {},
  async () => run(() => cortexGet("/api/integrations/supabase"))
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 10b: Mars (Obsidian vault)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_journal_today",
  "Read today's Mars vault journal entry (YAML frontmatter + body)",
  {},
  async () => run(() => cortexGet("/api/mars/journal"))
);

server.tool(
  "get_journal_day",
  "Read a specific day's Mars journal entry",
  { date: z.string().describe("YYYY-MM-DD") },
  async ({ date }) => run(() => cortexGet(`/api/mars/journal?date=${encodeURIComponent(date)}`))
);

server.tool(
  "write_journal_line",
  "Append a timestamped line to today's (or another day's) Mars journal entry. Creates the file with frontmatter if it doesn't exist.",
  {
    text: z.string().describe("The line to append"),
    date: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
    tag: z.string().optional().describe("Optional category tag prefix, e.g. 'habit', 'capture', 'session'"),
  },
  async ({ text, date, tag }) => run(() => cortexPost("/api/mars/journal", { text, date, tag }))
);

server.tool(
  "search_vault",
  "Grep across the Mars vault content/ folder. Returns line-level matches with paths.",
  {
    query: z.string().describe("Substring to search (case-insensitive)"),
    limit: z.number().optional().describe("Max matches (default 20)"),
  },
  async ({ query, limit }) => run(() => cortexGet(`/api/mars/search?q=${encodeURIComponent(query)}&limit=${limit ?? 20}`))
);

server.tool(
  "get_voice_anchors",
  "Read the 8 voice-anchor markdown files (canonical Pablo voice samples for the voice-post skill)",
  {},
  async () => run(() => cortexGet("/api/mars/voice-anchors"))
);

server.tool(
  "get_vault_stats",
  "Get Mars vault stats (total notes, by-folder counts, recent notes)",
  {},
  async () => run(() => cortexGet("/api/mars/stats"))
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 11: Projects
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "scan_projects",
  "Scan ~/Projects directory and return all project info (name, tech stack, git remote, latest commit, scripts)",
  {},
  async () => run(() => cortexGet("/api/projects/scan"))
);

server.tool(
  "get_project_meta",
  "Get project metadata (status, priority, description, notes) for all or a specific project",
  { project: z.string().optional().describe("Project name filter") },
  async ({ project }) => run(async () => {
    const meta = ((await readKey("cortex-project-meta")) || {}) as Record<string, unknown>;
    if (project) return meta[project] || { error: `No metadata for project '${project}'` };
    return meta;
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 12: Student
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_assignments",
  "Get student assignments with optional course/status filter",
  {
    courseId: z.string().optional().describe("Filter by course ID"),
    undoneOnly: z.boolean().optional().describe("Only show incomplete assignments"),
  },
  async ({ courseId, undoneOnly }) => run(async () => {
    let assignments = ((await readKey("cortex-student-assignments")) || []) as Record<string, unknown>[];
    if (courseId) assignments = assignments.filter(a => a.courseId === courseId);
    if (undoneOnly) assignments = assignments.filter(a => !a.done);
    return assignments;
  })
);

server.tool(
  "get_topics",
  "Get study topics with optional course filter",
  {
    courseId: z.string().optional().describe("Filter by course ID"),
    status: z.string().optional().describe("Filter by mastery status"),
  },
  async ({ courseId, status }) => run(async () => {
    let topics = ((await readKey("cortex-student-topics")) || []) as Record<string, unknown>[];
    if (courseId) topics = topics.filter(t => t.courseId === courseId);
    if (status) topics = topics.filter(t => t.status === status);
    return topics;
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 13: Finance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_finances",
  "Get financial data (income, expenses, subscriptions)",
  {},
  async () => run(() => readKey("cortex-finances"))
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 14: Automations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "run_automation",
  "Submit an automation run result to Cortex (for scheduled tasks, scripts, CI results)",
  {
    taskName: z.string(),
    status: z.string().optional().describe("success | error | pending-approval"),
    summary: z.string().optional(),
    fullOutput: z.string().optional(),
  },
  async (params) => run(() => cortexPost("/api/automation/run", params))
);

server.tool(
  "get_automation_runs",
  "Get recent automation run history",
  {
    limit: z.number().optional().describe("Max results (default 20)"),
    taskName: z.string().optional().describe("Filter by task name"),
  },
  async ({ limit, taskName }) => run(async () => {
    const data = ((await readKey("cortex-automations")) || { runs: [] }) as { runs: Record<string, unknown>[] };
    let runs = data.runs || [];
    if (taskName) runs = runs.filter(r => r.taskName === taskName);
    return runs.slice(0, limit || 20);
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 15: Weekly Audit
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_weekly_audit",
  "Get weekly performance audit data for a specific week",
  { weekId: z.string().describe("Week identifier (e.g. '2026-W15')") },
  async ({ weekId }) => run(() => readKey(`cortex-weekly-audit-${weekId}`))
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 17: Founder Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_founder_history",
  "Get historical founder metrics (commits, MRR, users, deploys over time)",
  {
    days: z.number().optional().describe("Number of days of history (default all)"),
  },
  async ({ days }) => run(async () => {
    const history = ((await readKey("cortex-founder-history")) || []) as unknown[];
    if (days) return history.slice(-days);
    return history;
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 18: Generic Data Access (escape hatch)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "list_data_keys",
  "List all available data store keys in Cortex",
  {},
  async () => run(() => cortexGet("/api/data/keys"))
);

server.tool(
  "read_data",
  "Read any Cortex data store by key (generic escape hatch for data not covered by other tools)",
  { key: z.string().describe("Data key (e.g. 'cortex-habits', 'cortex-daily-reflection-2026-04-07')") },
  async ({ key }) => run(() => readKey(key))
);

server.tool(
  "write_data",
  "Write to any Cortex data store by key (generic escape hatch — use domain-specific tools when possible)",
  {
    key: z.string().describe("Data key"),
    data: z.unknown().describe("JSON data to write"),
  },
  async ({ key, data }) => run(async () => {
    await writeKey(key, data);
    return { ok: true, key };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP 19: Study hub (class materials + study notes + subject context)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Store-key shapes are duplicated here (the MCP server shares no types with
// the app); they must match src/features/student/* byte-for-byte.

interface McpCourse {
  id: string;
  name: string;
  difficulty: string;
  iconKey: string;
  semester: string;
  status: string;
  credits: number;
  notes?: string;
}
interface McpAssignment {
  id: string;
  name: string;
  courseId: string;
  type: string;
  weight: number;   // fraction of the final grade (0.20 = 20%)
  grade?: number;   // 0–5 Colombian scale
  deadline?: string; // "YYYY-MM-DD"
  done: boolean;
  priority: string;
  notes?: string;
}
interface McpTopic {
  id: string;
  name: string;
  courseId: string;
  chapter: string;
  types: string[];
  mastery: number;
  status: string;
  priority: string;
  week?: number;
}
interface McpMaterialFile { mediaId: string; name: string; mime: string; size: number }
interface McpClassMaterial {
  id: string;
  courseId: string;
  kind: "file" | "link" | "text";
  name: string;
  unit?: string;        // Brightspace-style: "Unidad 1", "Contenidos generales" …
  description?: string;
  tags: string[];
  file?: McpMaterialFile; // kind === 'file' — bytes live in the media store
  url?: string;           // kind === 'link'
  text?: string;          // kind === 'text'
  addedAt: string;        // ISO datetime
  source: "app" | "mcp";
}
interface McpStudyNote {
  id: string;
  courseId?: string;   // undefined = general (not tied to one course)
  courseName?: string; // denormalized snapshot (survives course rename/delete)
  text: string;
  tags: string[];
  pinned: boolean;
  source: "claude" | "manual";
  context?: string;
  createdAt: string;
  updatedAt?: string;
}

const MATERIALS_KEY = "cortex-class-materials";
const STUDY_NOTES_KEY = "cortex-study-notes";

// Case- and diacritic-insensitive normalizer — course names are Spanish
// ("Cálculo 3", "Debates Humanísticos"), so NFD-strip the marks.
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
const acronym = (name: string) => norm(name).split(" ").filter((w) => w.length >= 3).map((w) => w[0]).join("");
const round2 = (n: number) => Math.round(n * 100) / 100;

// Scoring ladder for fuzzy subject → course resolution.
function courseScore(c: McpCourse, raw: string, q: string, activeSemester: string): number {
  const n = norm(c.name);
  let s = 0;
  if (c.id === raw.trim() || norm(c.id) === q) s = 100;
  else if (n === q) s = 95;
  else if (acronym(c.name) === q) s = 85;
  else if (n.startsWith(q)) s = 80;
  else if (n.includes(q)) s = 70;
  else {
    // Token subsets both ways: a short subject inside a long course name
    // ("debates" → "Debates Humanísticos") and a long official subject around a
    // short course name ("Debates Humanísticos Contemporáneos" → "Debates
    // Humanísticos"). Token-level, so "ia" never matches inside "materia".
    const nTokens = n.split(" ");
    const qTokens = q.split(" ");
    const nSet = new Set(nTokens);
    const qSet = new Set(qTokens);
    if (qTokens.every((t) => nSet.has(t)) || nTokens.every((t) => qSet.has(t))) s = 60;
  }
  if (s > 0 && c.semester === activeSemester) s += 5; // active-semester tie-break
  return s;
}

async function resolveCourse(subject: string): Promise<McpCourse> {
  const courses = (await readKey<McpCourse[]>("cortex-student-courses")) || null;
  if (!courses || courses.length === 0) throw new Error("Cortex has no courses yet — relaunch the Cortex app (defaults seed on launch), or add a course in the Student page.");
  const q = norm(subject);
  if (!q) throw new Error("subject is required.");
  const activeSemester = ((await readKey<string>("cortex-student-active-semester")) || "") as string;
  const scored = courses
    .map((c) => ({ c, s: courseScore(c, subject, q, activeSemester) }))
    .sort((a, b) => b.s - a.s);
  const list = courses.map((c) => `${c.name} (${c.id}, ${c.semester})`).join(", ");
  if (scored[0].s < 60) throw new Error(`No course matches "${subject}". Courses: ${list}. Use the exact name or id.`);
  if (scored[1] && scored[0].s - scored[1].s < 5) {
    const [a, b] = [scored[0].c, scored[1].c];
    throw new Error(`"${subject}" is ambiguous between ${a.name} (${a.id}, ${a.semester}) and ${b.name} (${b.id}, ${b.semester}). Use the exact name or id.`);
  }
  return scored[0].c;
}

// Normalize legacy/partial records at read time (never persisted back).
const normMaterial = (m: McpClassMaterial): McpClassMaterial => ({
  ...m,
  tags: m.tags ?? [],
  kind: m.kind === "file" || m.kind === "link" || m.kind === "text" ? m.kind : m.file ? "file" : "text",
});
const normNote = (n: McpStudyNote): McpStudyNote => ({ ...n, tags: n.tags ?? [], pinned: n.pinned ?? false });

const loadMaterials = async () => (((await readKey<McpClassMaterial[]>(MATERIALS_KEY)) || []) as McpClassMaterial[]).map(normMaterial);
const loadStudyNotes = async () => (((await readKey<McpStudyNote[]>(STUDY_NOTES_KEY)) || []) as McpStudyNote[]).map(normNote);
const loadCourses = async () => (((await readKey<McpCourse[]>("cortex-student-courses")) || []) as McpCourse[]);
const loadAssignments = async () => (((await readKey<McpAssignment[]>("cortex-student-assignments")) || []) as McpAssignment[]);
const loadStudentTopics = async () => (((await readKey<McpTopic[]>("cortex-student-topics")) || []) as McpTopic[]);
const loadClasses = async () => (((await readKey<ClassDef[]>("cortex-classes")) || []) as ClassDef[]);

// Pinned first, then newest.
const noteOrder = (a: McpStudyNote, b: McpStudyNote) =>
  (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.createdAt || "").localeCompare(a.createdAt || "");

// Notes for a course: courseId match, plus courseName-snapshot match for
// orphaned notes whose course was deleted and re-created under a new id.
const noteMatchesCourse = (n: McpStudyNote, course: McpCourse) =>
  n.courseId === course.id || (!!n.courseName && norm(n.courseName) === norm(course.name));

// Material entry safe to inline in tool output — refs only, NEVER file bytes.
function lightMaterial(m: McpClassMaterial) {
  return {
    id: m.id,
    name: m.name,
    kind: m.kind,
    ...(m.unit ? { unit: m.unit } : {}),
    ...(m.description ? { description: m.description } : {}),
    tags: m.tags,
    ...(m.kind === "link" && m.url ? { url: m.url } : {}),
    ...(m.kind === "file" && m.file
      ? { size: m.file.size, mime: m.file.mime, hint: "Call read_class_material to download this file for Reading." }
      : {}),
    addedAt: m.addedAt,
  };
}

// Brightspace-style unit ordering (same as the Materials tab): "Contenidos
// generales" first, "Unidad N" numeric, other units alphabetical, unfiled
// ("General") last.
function unitRank(unit: string): { tier: number; num: number } {
  const n = norm(unit);
  if (n === "general") return { tier: 3, num: 0 };
  if (n === "contenidos generales") return { tier: 0, num: 0 };
  const m = n.match(/^unidad (\d+)$/);
  if (m) return { tier: 1, num: parseInt(m[1], 10) };
  return { tier: 2, num: 0 };
}

function groupByUnit(materials: McpClassMaterial[]) {
  // Key by norm(unit) so case/diacritic variants of the same unit file
  // together (like the Materials tab); the first-seen raw label is displayed.
  const byUnit = new Map<string, { label: string; mats: McpClassMaterial[] }>();
  for (const m of materials) {
    const label = m.unit?.trim() || "General";
    const key = norm(label);
    if (!byUnit.has(key)) byUnit.set(key, { label, mats: [] });
    byUnit.get(key)!.mats.push(m);
  }
  return [...byUnit.values()]
    .sort((a, b) => {
      const ra = unitRank(a.label), rb = unitRank(b.label);
      return ra.tier - rb.tier || ra.num - rb.num || norm(a.label).localeCompare(norm(b.label));
    })
    .map(({ label, mats }) => ({ unit: label, materials: mats.map(lightMaterial) }));
}

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

// HTTP media path cap — the server's body limit is 25 MB including base64
// overhead, so raw files above 15 MB can't make it through.
const MEDIA_MAX_BYTES = 15 * 1024 * 1024;
const fmtMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

server.tool(
  "get_study_context",
  "Bootstrap a study session for one course. Fuzzy-resolves the subject ('calculo 3', 'so', 'debates' — case/diacritic-insensitive name, acronym, or id), then bundles course meta, weekly schedule, grade state (current/best/worst on the 0–5 scale), upcoming assignments, topics, class materials grouped by unit (refs only — call read_class_material for file contents), and past study notes. Call this FIRST when Pablo names a subject.",
  {
    subject: z.string().describe("Course name, fragment, acronym, or id — e.g. 'calculo 3', 'so', 'debates'"),
    max_notes: z.number().optional().describe("Max study notes to include (default 25)"),
  },
  async ({ subject, max_notes }) => run(async () => {
    const course = await resolveCourse(subject);
    const [assignments, topics, classes, materials, notes] = await Promise.all([
      loadAssignments(), loadStudentTopics(), loadClasses(), loadMaterials(), loadStudyNotes(),
    ]);

    // Grade math mirrors the Student page Overview (0–5 Colombian scale).
    const mine = assignments.filter((a) => a.courseId === course.id);
    const totalWeight = mine.reduce((s, a) => s + a.weight, 0);
    const graded = mine.filter((a) => a.grade !== undefined);
    const gradedWeight = graded.reduce((s, a) => s + a.weight, 0);
    const gradedSum = graded.reduce((s, a) => s + a.grade! * a.weight, 0);
    const ungradedWeight = mine.filter((a) => a.grade === undefined).reduce((s, a) => s + a.weight, 0);
    const current = gradedWeight > 0 ? round2(gradedSum / gradedWeight) : null;
    const best = round2(totalWeight > 0 ? (gradedSum + 5.0 * ungradedWeight) / totalWeight : 5.0);
    const worst = round2(totalWeight > 0 ? gradedSum / totalWeight : 0);
    const gradedPct = Math.round(totalWeight > 0 ? (gradedWeight / totalWeight) * 100 : 0);

    const t = today();
    const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
    const weightPct = (w: number) => Math.round(w * 100 * 10) / 10;
    const undone = mine.filter((a) => !a.done);
    const upcoming = undone
      .filter((a) => a.deadline && a.deadline >= t)
      .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
      .map((a) => ({
        id: a.id, name: a.name, type: a.type, weight_pct: weightPct(a.weight),
        deadline: a.deadline!, days_left: daysUntil(a.deadline!), priority: a.priority,
        ...(a.notes ? { notes: a.notes } : {}),
      }));
    const openUndated = undone
      .filter((a) => !a.deadline)
      .map((a) => ({
        id: a.id, name: a.name, type: a.type, weight_pct: weightPct(a.weight), priority: a.priority,
        ...(a.notes ? { notes: a.notes } : {}),
      }));

    // Schedule linkage: courseId match, plus normalized courseName fallback
    // for MCP-added classes whose slug differs from the Student-page id.
    const schedule = classes
      .filter((c) => c.courseId === course.id || norm(c.courseName) === norm(course.name))
      .map((c) => ({
        days: c.days.map((d) => DAY_NAMES[d]), startTime: c.startTime, endTime: c.endTime,
        ...(c.room ? { room: c.room } : {}),
      }));

    const courseNotes = notes.filter((n) => noteMatchesCourse(n, course)).sort(noteOrder).slice(0, max_notes ?? 25);

    return {
      course: {
        id: course.id, name: course.name, semester: course.semester, difficulty: course.difficulty,
        status: course.status, credits: course.credits, ...(course.notes ? { notes: course.notes } : {}),
      },
      schedule,
      grade_state: { scale: "0-5", current, best_possible: best, worst_possible: worst, graded_pct: gradedPct },
      assignments: { upcoming, open_undated: openUndated, done_count: mine.filter((a) => a.done).length },
      topics: topics
        .filter((tp) => tp.courseId === course.id)
        .map((tp) => ({
          id: tp.id, name: tp.name, chapter: tp.chapter, types: tp.types, mastery: tp.mastery,
          status: tp.status, priority: tp.priority, ...(tp.week !== undefined ? { week: tp.week } : {}),
        })),
      materials_by_unit: groupByUnit(materials.filter((m) => m.courseId === course.id)),
      notes: courseNotes.map((n) => ({
        id: n.id, text: n.text, tags: n.tags, pinned: n.pinned, source: n.source,
        ...(n.context ? { context: n.context } : {}), createdAt: n.createdAt,
      })),
      next_steps: "read_class_material(id) downloads a file to disk for Reading; save_study_note captures durable facts Pablo states.",
    };
  })
);

server.tool(
  "save_study_note",
  "Save a durable study note that persists across Claude sessions — a fact, decision, prof constraint, or insight Pablo states. Attach it to a course via subject, or omit subject for a general note. It lands in the app's Student → Notes tab.",
  {
    text: z.string().describe("The note text"),
    subject: z.string().optional().describe("Course to attach it to (fuzzy name/acronym/id); omit for a general note"),
    tags: z.array(z.string()).optional().describe("Freeform tags, e.g. ['parcial-2', 'grafos']"),
    pinned: z.boolean().optional().describe("Pin it to the top of the course's notes (default false)"),
    context: z.string().optional().describe("What was being worked on when this was captured"),
  },
  async ({ text, subject, tags, pinned, context }) => run(async () => {
    if (!text.trim()) throw new Error("text is required.");
    const course = subject ? await resolveCourse(subject) : null;
    const note: McpStudyNote = {
      id: uid("note"),
      ...(course ? { courseId: course.id, courseName: course.name } : {}),
      text: text.trim(),
      tags: tags ?? [],
      pinned: pinned ?? false,
      source: "claude",
      ...(context && context.trim() ? { context: context.trim() } : {}),
      createdAt: new Date().toISOString(),
    };
    await mutateKey<McpStudyNote[]>(STUDY_NOTES_KEY, (notes) => {
      notes.push(note);
      return notes;
    }, []);
    return { ok: true, note };
  })
);

server.tool(
  "get_study_notes",
  "List saved study notes — pinned first, then newest. Filter by subject (fuzzy course match), free-text query (over text/tags/context), or pinned only.",
  {
    subject: z.string().optional().describe("Course filter (fuzzy name/acronym/id)"),
    query: z.string().optional().describe("Free-text filter over note text, tags, and context (case/diacritic-insensitive)"),
    pinned_only: z.boolean().optional().describe("Only pinned notes"),
    limit: z.number().optional().describe("Max notes to return (default 50)"),
  },
  async ({ subject, query, pinned_only, limit }) => run(async () => {
    let notes = await loadStudyNotes();
    if (subject) {
      const course = await resolveCourse(subject);
      notes = notes.filter((n) => noteMatchesCourse(n, course));
    }
    if (query) {
      const q = norm(query);
      notes = notes.filter((n) =>
        norm(n.text).includes(q) || n.tags.some((tg) => norm(tg).includes(q)) || (!!n.context && norm(n.context).includes(q)));
    }
    if (pinned_only) notes = notes.filter((n) => n.pinned);
    notes.sort(noteOrder);
    const shown = notes.slice(0, limit ?? 50);
    return { total: notes.length, showing: shown.length, notes: shown };
  })
);

server.tool(
  "add_class_material",
  "File a class material under a course: a file from disk (file_path, ≤15 MB — bytes go to the media store), raw file bytes (content_base64, for conversation attachments with no path on this machine), a link (url), or a text snippet (text). Exactly one of the four. Optionally place it in a Brightspace-style unit ('Unidad 1', 'Contenidos generales').",
  {
    subject: z.string().describe("Course to file it under (fuzzy name/acronym/id)"),
    file_path: z.string().optional().describe("Absolute path to a file on disk (≤15 MB)"),
    content_base64: z.string().optional().describe("Raw base64 file bytes (data-URL prefix and line wraps tolerated, ≤15 MB decoded) — use for files that exist as chat attachments or in-memory rather than on disk. Requires name; its extension sets the mime."),
    url: z.string().optional().describe("Link URL, e.g. a Brightspace or YouTube page"),
    text: z.string().optional().describe("Text snippet content"),
    name: z.string().optional().describe("Display name (defaults: filename / url host+path / first words of text)"),
    unit: z.string().optional().describe("Unit to file under, e.g. 'Unidad 1' or 'Contenidos generales'"),
    description: z.string().optional().describe("Short description"),
    tags: z.array(z.string()).optional().describe("Freeform tags"),
  },
  async ({ subject, file_path, content_base64, url, text, name, unit, description, tags }) => run(async () => {
    // Trim once up front so the exactly-one check and the branch dispatch
    // agree — a whitespace-only arg is absent for both.
    const fp = file_path?.trim() || undefined;
    const b64 = content_base64?.trim() || undefined;
    const linkUrl = url?.trim() || undefined;
    const snippet = text?.trim() || undefined;
    const provided = [fp, b64, linkUrl, snippet].filter((v) => v !== undefined);
    if (provided.length !== 1) throw new Error("Provide exactly one of file_path, content_base64, url, or text.");
    const course = await resolveCourse(subject);

    const base: Pick<McpClassMaterial, "id" | "courseId" | "tags" | "addedAt" | "source"> &
      Partial<Pick<McpClassMaterial, "unit" | "description">> = {
      id: uid("mat"),
      courseId: course.id,
      ...(unit && unit.trim() ? { unit: unit.trim() } : {}),
      ...(description && description.trim() ? { description: description.trim() } : {}),
      tags: tags ?? [],
      addedAt: new Date().toISOString(),
      source: "mcp",
    };

    let material: McpClassMaterial;
    if (fp) {
      if (!path.isAbsolute(fp)) throw new Error("file_path must be an absolute path.");
      const stat = await fs.stat(fp);
      if (stat.size > MEDIA_MAX_BYTES) {
        throw new Error(`File is ${fmtMB(stat.size)} — the HTTP media path caps uploads at ${fmtMB(MEDIA_MAX_BYTES)}.`);
      }
      const buf = await fs.readFile(fp);
      const basename = path.basename(fp);
      const ext = (path.extname(basename).slice(1).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin");
      const mediaId = `${uid("mat")}.${ext}`;
      // Raw base64, no data-URL prefix — the server strips only image prefixes.
      await cortexPost("/api/media", { id: mediaId, base64: buf.toString("base64") });
      material = {
        ...base,
        kind: "file",
        name: name?.trim() || basename,
        file: { mediaId, name: basename, mime: EXT_MIME[ext] || "application/octet-stream", size: stat.size },
      };
    } else if (b64) {
      const fileName = name?.trim();
      if (!fileName) throw new Error("name is required with content_base64 — its extension sets the mime, e.g. 'guia-parcial.pdf'.");
      // Attachments often arrive as data URLs or line-wrapped base64; store the
      // cleaned raw base64 (the media endpoint strips only image data-URL prefixes).
      const comma = b64.indexOf("base64,");
      const raw = (comma >= 0 ? b64.slice(comma + "base64,".length) : b64).replace(/\s+/g, "");
      const buf = Buffer.from(raw, "base64");
      if (buf.byteLength === 0) throw new Error("content_base64 decoded to zero bytes — is it valid base64?");
      if (buf.byteLength > MEDIA_MAX_BYTES) {
        throw new Error(`Decoded content is ${fmtMB(buf.byteLength)} — the HTTP media path caps uploads at ${fmtMB(MEDIA_MAX_BYTES)}.`);
      }
      const ext = (path.extname(fileName).slice(1).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin");
      const mediaId = `${uid("mat")}.${ext}`;
      await cortexPost("/api/media", { id: mediaId, base64: raw });
      material = {
        ...base,
        kind: "file",
        name: fileName,
        file: { mediaId, name: fileName, mime: EXT_MIME[ext] || "application/octet-stream", size: buf.byteLength },
      };
    } else if (linkUrl) {
      let parsed: URL;
      try { parsed = new URL(linkUrl); } catch { throw new Error(`url is not a valid URL: "${linkUrl}".`); }
      material = {
        ...base,
        kind: "link",
        name: name?.trim() || `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`,
        url: linkUrl,
      };
    } else {
      material = {
        ...base,
        kind: "text",
        name: name?.trim() || snippet!.split(/\s+/).slice(0, 6).join(" "),
        text: text!,
      };
    }

    await mutateKey<McpClassMaterial[]>(MATERIALS_KEY, (materials) => {
      materials.push(material);
      return materials;
    }, []);
    // Best-effort incremental semantic index of the new material — appends to
    // an existing index only, and can never fail the add (no creds / Voyage
    // down / no index yet all land here silently). Latency-bounded: if Voyage
    // is slow (429 backoff), the add returns after 15s and indexing finishes
    // in the background.
    const bgIndex = indexMaterialIncremental(material as SearchMaterial, course.name)
      .catch(() => { /* the add already succeeded — indexing is a bonus */ });
    await Promise.race([bgIndex, new Promise((r) => setTimeout(r, 15_000))]);
    return { ok: true, material };
  })
);

server.tool(
  "list_class_materials",
  "Light index of filed class materials (refs only, no file bytes), grouped course → unit. Filter by subject, unit, kind, or free-text query over name/description/tags.",
  {
    subject: z.string().optional().describe("Course filter (fuzzy name/acronym/id)"),
    unit: z.string().optional().describe("Unit filter, e.g. 'Unidad 1' ('General' = unfiled)"),
    kind: z.enum(["file", "link", "text"]).optional().describe("Material kind filter"),
    query: z.string().optional().describe("Free-text filter over name, description, and tags (case/diacritic-insensitive)"),
  },
  async ({ subject, unit, kind, query }) => run(async () => {
    let materials = await loadMaterials();
    if (subject) {
      const course = await resolveCourse(subject);
      materials = materials.filter((m) => m.courseId === course.id);
    }
    if (unit) materials = materials.filter((m) => norm(m.unit || "General") === norm(unit));
    if (kind) materials = materials.filter((m) => m.kind === kind);
    if (query) {
      const q = norm(query);
      materials = materials.filter((m) =>
        norm(m.name).includes(q) || (!!m.description && norm(m.description).includes(q)) || m.tags.some((tg) => norm(tg).includes(q)));
    }
    const courses = await loadCourses();
    const byCourse = new Map<string, McpClassMaterial[]>();
    for (const m of materials) {
      if (!byCourse.has(m.courseId)) byCourse.set(m.courseId, []);
      byCourse.get(m.courseId)!.push(m);
    }
    return {
      courses: [...byCourse.entries()].map(([courseId, mats]) => {
        const c = courses.find((cr) => cr.id === courseId);
        return {
          course: c ? { id: c.id, name: c.name, semester: c.semester } : { id: courseId, name: courseId, semester: "" },
          units: groupByUnit(mats),
        };
      }),
      total: materials.length,
    };
  })
);

server.tool(
  "read_class_material",
  "Fetch one material's content by id: text returns inline, links return the URL to fetch, files are downloaded to a temp path for Reading (PDFs and images are Readable).",
  { id: z.string().describe("Material ID (from list_class_materials or get_study_context)") },
  async ({ id }) => run(async () => {
    const materials = await loadMaterials();
    const m = materials.find((mat) => mat.id === id);
    if (!m) throw new Error(`No material found with id "${id}". Use list_class_materials to list ids.`);
    if (m.kind === "text") return { kind: "text", name: m.name, text: m.text ?? "" };
    if (m.kind === "link") return { kind: "link", name: m.name, url: m.url ?? "", hint: "Fetch this URL for the content." };
    if (!m.file) throw new Error(`File bytes are missing for material "${id}" — it has no media reference.`);
    const dataUrl = await cortexGet(`/api/media?id=${encodeURIComponent(m.file.mediaId)}`);
    if (dataUrl === null) throw new Error(`File bytes are missing for material "${id}" — the media file may have been deleted.`);
    // Response is a JSON data-URL string with a guessed mime — strip the
    // prefix and trust the material record's mime instead.
    const s = String(dataUrl);
    const idx = s.indexOf("base64,");
    const buf = Buffer.from(idx >= 0 ? s.slice(idx + 7) : s, "base64");
    const dir = path.join(os.tmpdir(), "cortex-materials");
    await fs.mkdir(dir, { recursive: true });
    const safeName = `${m.file.mediaId}-${m.file.name.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
    const filePath = path.join(dir, safeName);
    // Reuse an existing tmp copy if it already has the same byte length.
    const existing = await fs.stat(filePath).catch(() => null);
    if (!existing || existing.size !== buf.length) await fs.writeFile(filePath, buf);
    return {
      kind: "file", name: m.name, mime: m.file.mime, size: m.file.size, path: filePath,
      hint: "Read this path (PDFs and images are Readable).",
    };
  })
);

server.tool(
  "index_class_materials",
  "Build or refresh the semantic search index over class materials (Voyage contextualized embeddings, stored locally). Embeds text snippets and .md/.txt file contents; links and binary files (PDFs, docx) are indexed by name+description+tags only. Only new/changed materials are re-embedded unless force. Run this after filing materials, then query with search_class_materials.",
  {
    subject: z.string().optional().describe("Limit (re)indexing to one course (fuzzy name/acronym/id); other courses' entries are kept as-is"),
    force: z.boolean().optional().describe("Re-embed everything in scope even if unchanged (default false)"),
  },
  async ({ subject, force }) => run(async () => {
    const course = subject ? await resolveCourse(subject) : null;
    const [materials, courses] = await Promise.all([loadMaterials(), loadCourses()]);
    return buildMaterialsIndex(materials as SearchMaterial[], courses, {
      force: force ?? false,
      ...(course ? { scopeCourseId: course.id } : {}),
    });
  })
);

server.tool(
  "search_class_materials",
  "Semantic search over indexed class materials — meaning-aware, cross-language-friendly (query in Spanish or English). Returns the top-k matching chunks with material refs (id, name, course, unit, score) and the chunk text — never file bytes; use read_class_material(id) for the full file. Requires an index built by index_class_materials.",
  {
    query: z.string().describe("Natural-language query, e.g. 'cuando es el debate de migracion'"),
    subject: z.string().optional().describe("Course filter (fuzzy name/acronym/id)"),
    unit: z.string().optional().describe("Unit filter, e.g. 'Unidad 1' ('General' = unfiled)"),
    k: z.number().optional().describe("Max hits to return (default 8, max 50)"),
  },
  async ({ query, subject, unit, k }) => run(async () => {
    const course = subject ? await resolveCourse(subject) : null;
    const courses = await loadCourses();
    return searchMaterialsIndex(query, courses, {
      ...(course ? { courseId: course.id } : {}),
      ...(unit ? { unit } : {}),
      ...(k !== undefined ? { k } : {}),
    });
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP: Food pipeline (Market ↔ Nutrition ↔ Finances)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Store-key shapes are duplicated here (the MCP server shares no types with the
// app); they must match src/features/gym/* and src/features/finance/FinancePage.

interface McpFoodItem { name: string; protein: number; calories: number; quantity?: string }
interface McpMealEntry { id: string; name: string; foods: McpFoodItem[] }
interface McpDailyNutrition { date: string; meals: McpMealEntry[]; waterLiters: number; weight?: number; notes?: string }
interface McpGroceryItem { id: string; name: string; price: number; quantity: number; store: string; category: string }
interface McpWeeklyMarketLog { weekStart: string; items: McpGroceryItem[] }
interface McpFinanceItem { id: string; name: string; type: string; category?: string; months: number[]; paid?: boolean[]; paidAmounts?: number[] }
interface McpFinanceData { year: number; items: McpFinanceItem[] }
interface McpPantryItem { id: string; name: string; protein: number; calories: number; serving?: string; quantity?: number; category?: string; source?: string; addedAt?: string }
interface McpMarketListItem { name: string; price: number; quantity: number; store: string; category: string; timesBought?: number; lastBought?: string; checked?: boolean }
interface McpMarketList { generatedAt: string; weeksAnalyzed?: number; items: McpMarketListItem[] }
interface McpMealTemplate { id: string; name: string; description: string; meals: { id: string; name: string; foods: McpFoodItem[] }[] }
interface McpNutritionTargets { protein: number; calories: number; water: number }

const DEFAULT_TARGETS: McpNutritionTargets = { protein: 156, calories: 3150, water: 2.5 };

function localDateOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Monday (YYYY-MM-DD) of the week containing dateStr — matches the app's getWeekDates()[0].
function weekStartMonday(dateStr?: string): string {
  const d = new Date((dateStr || today()) + "T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return localDateOf(d);
}
function emptyDailyNutrition(date: string): McpDailyNutrition {
  return {
    date,
    meals: [
      { id: "breakfast", name: "Breakfast", foods: [] },
      { id: "lunch", name: "Lunch", foods: [] },
      { id: "dinner", name: "Dinner", foods: [] },
      { id: "snack", name: "Snack", foods: [] },
    ],
    waterLiters: 0,
  };
}
function nutritionTotals(day: McpDailyNutrition): { protein: number; calories: number; water: number } {
  let protein = 0, calories = 0;
  for (const m of day.meals || []) for (const f of m.foods || []) { protein += f.protein || 0; calories += f.calories || 0; }
  return { protein, calories, water: day.waterLiters || 0 };
}

// Monday dates of the market weeks that touch a calendar month (mirrors the app's getWeeksInMonth).
function mondaysInMonth(year: number, month: number): string[] {
  const weeks: string[] = [];
  const d = new Date(year, month, 1);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  for (let guard = 0; guard < 8; guard++) {
    const weekEnd = new Date(d);
    weekEnd.setDate(d.getDate() + 6);
    if (d.getMonth() > month && d.getFullYear() >= year) break;
    if (weekEnd.getMonth() >= month || weekEnd.getFullYear() > year || d.getMonth() === month || weekEnd.getMonth() === month) {
      weeks.push(localDateOf(new Date(d)));
    }
    d.setDate(d.getDate() + 7);
    if (weeks.length > 6) break;
  }
  return weeks;
}
// Total grocery spend in a calendar month — the single source of truth for the Food budget's "spent".
async function marketMonthTotal(year: number, month: number): Promise<number> {
  let total = 0;
  for (const wk of mondaysInMonth(year, month)) {
    const wl = (await readKey(`cortex-market-${wk}`)) as McpWeeklyMarketLog | null;
    if (wl && Array.isArray(wl.items)) total += wl.items.reduce((s, it) => s + it.price * it.quantity, 0);
  }
  return total;
}

server.tool(
  "add_bill",
  "Add a grocery bill/receipt to Cortex. Parse the receipt first, then call this with the line items. It (1) appends the items to the current week's Market log, (2) creates Nutrition pantry objects for edible items so they're loggable later, and (3) deducts the bill total from the Food budget in Finances.",
  {
    store: z.string().optional().describe("Store for the bill (D1, Carulla, Exito, Rappi, Other). Default per-item store."),
    date: z.string().optional().describe("YYYY-MM-DD of purchase, defaults to today. Picks the Market week and Finances month."),
    total: z.number().optional().describe("Grand total in COP incl. tax. Defaults to sum(price*quantity). This is deducted from the Food budget."),
    deductFromFinances: z.boolean().optional().describe("Deduct total from the Finances Food budget. Default true."),
    items: z.array(z.object({
      name: z.string(),
      price: z.number().describe("Unit price in COP"),
      quantity: z.number().optional().describe("Units bought, default 1"),
      store: z.string().optional().describe("Overrides the bill store for this item"),
      category: z.string().optional().describe("Protein | Carbs | Snacks | Dairy | Produce | Hygiene | Other"),
      nutrition: z.object({
        protein: z.number().describe("grams per serving"),
        calories: z.number().describe("kcal per serving"),
        serving: z.string().optional().describe('e.g. "1 egg", "100g", "1 scoop"'),
        servings: z.number().optional().describe("servings on hand from this purchase"),
      }).optional().describe("Include ONLY for edible items — creates a Nutrition pantry object. Omit for non-food (hygiene) items."),
    })).describe("Line items from the receipt"),
  },
  async ({ store, date, total, deductFromFinances, items }) => run(async () => {
    const d = date || today();

    // 1) Market: append to the week's log. Grocery records are minted once so a
    // conflict retry (which re-runs the callback on fresh data) can't change ids.
    const wk = weekStartMonday(d);
    const marketKey = `cortex-market-${wk}`;
    let computedTotal = 0;
    const addedGrocery: McpGroceryItem[] = items.map((it) => {
      const qty = it.quantity ?? 1;
      computedTotal += it.price * qty;
      return { id: uid("grc"), name: it.name, price: it.price, quantity: qty, store: it.store || store || "Other", category: it.category || "Other" };
    });
    await mutateKey<McpWeeklyMarketLog>(marketKey, (log) => {
      if (!Array.isArray(log.items)) log.items = [];
      log.items.push(...addedGrocery);
      return log;
    }, { weekStart: wk, items: [] });

    // 2) Nutrition pantry: create loggable objects for edible items
    const addedPantry: McpPantryItem[] = items
      .filter((it) => it.nutrition)
      .map((it) => ({ id: uid("pan"), name: it.name, protein: it.nutrition!.protein, calories: it.nutrition!.calories, serving: it.nutrition!.serving, quantity: it.nutrition!.servings, category: it.category, source: "bill", addedAt: new Date().toISOString() }));
    if (addedPantry.length) {
      await mutateKey<McpPantryItem[]>("cortex-nutrition-pantry", (pantry) => {
        pantry.push(...addedPantry);
        return pantry;
      }, []);
    }

    // 3) Finances: the Food budget's "spent" for the month = the month's total market spend
    // (recomputed from the ledger, incl. the items we just added — never a blind increment,
    // so it stays consistent with the Market tab's live sync and can't double-count).
    const billTotal = total ?? computedTotal;
    let finances: { deducted: boolean; month?: number; foodBudget?: number; foodSpent?: number; remaining?: number } = { deducted: false };
    if (deductFromFinances !== false) {
      await mutateKey<McpFinanceData | null>("cortex-finances", async (fin) => {
        if (!fin || !Array.isArray(fin.items)) return NO_WRITE;
        const when = new Date(d + "T00:00:00");
        const month = when.getMonth();
        const monthSpent = await marketMonthTotal(when.getFullYear(), month);
        let food: McpFinanceItem | undefined =
          fin.items.find(x => x.type === "Expense" && x.category === "Food" && x.name === "Food") ??
          fin.items.find(x => x.type === "Expense" && x.category === "Food");
        if (!food) {
          food = { id: uid("fin"), name: "Food", type: "Expense", category: "Food", months: Array(12).fill(0) as number[], paid: Array(12).fill(false) as boolean[], paidAmounts: Array(12).fill(0) as number[] };
          fin.items.push(food);
        }
        const months = (Array.isArray(food.months) && food.months.length === 12) ? food.months : (Array(12).fill(0) as number[]);
        const paidAmounts = (Array.isArray(food.paidAmounts) && food.paidAmounts.length === 12) ? food.paidAmounts : (Array(12).fill(0) as number[]);
        const paid = (Array.isArray(food.paid) && food.paid.length === 12) ? food.paid : (Array(12).fill(false) as boolean[]);
        paidAmounts[month] = monthSpent;
        paid[month] = (months[month] || 0) > 0 && monthSpent >= months[month];
        food.months = months; food.paidAmounts = paidAmounts; food.paid = paid;
        finances = { deducted: true, month, foodBudget: months[month] || 0, foodSpent: monthSpent, remaining: (months[month] || 0) - monthSpent };
        return fin;
      }, null);
    }

    return { ok: true, week: wk, billTotal, market: { key: marketKey, added: addedGrocery.length, items: addedGrocery }, pantry: { created: addedPantry.length, items: addedPantry }, finances };
  })
);

server.tool(
  "log_ate",
  "Log what the user ate into a day's Nutrition. Appends foods to a meal (Breakfast/Lunch/Dinner/Snack). If a food's macros are omitted they're resolved from the Nutrition pantry by name; otherwise pass your best estimate.",
  {
    date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    meal: z.string().optional().describe("Breakfast | Lunch | Dinner | Snack. Default Snack."),
    foods: z.array(z.object({
      name: z.string(),
      protein: z.number().optional().describe("grams; resolved from pantry if omitted"),
      calories: z.number().optional().describe("kcal; resolved from pantry if omitted"),
      quantity: z.string().optional().describe('e.g. "3 eggs", "200g"'),
    })).describe("Foods eaten"),
  },
  async ({ date, meal, foods }) => run(async () => {
    const d = date || today();
    const key = `cortex-nutrition-${d}`;
    const pantry: McpPantryItem[] = ((await readKey("cortex-nutrition-pantry")) as McpPantryItem[] | null) ?? [];
    let added: McpFoodItem[] = [];
    let mealNameOut = meal || "Snack";
    const day = await mutateKey<McpDailyNutrition>(key, (day) => {
      if (!Array.isArray(day.meals) || day.meals.length === 0) day.meals = emptyDailyNutrition(d).meals;
      const mealName = (meal || "Snack").toLowerCase();
      let target: McpMealEntry | undefined = day.meals.find(m => m.name.toLowerCase() === mealName || m.id.toLowerCase() === mealName);
      if (!target) { target = { id: uid("meal"), name: meal || "Snack", foods: [] }; day.meals.push(target); }
      added = [];
      for (const f of foods) {
        let protein = f.protein, calories = f.calories;
        if (protein === undefined || calories === undefined) {
          const match = pantry.find(p => p.name.toLowerCase() === f.name.toLowerCase());
          if (match) { protein = protein ?? match.protein; calories = calories ?? match.calories; }
        }
        const food: McpFoodItem = { name: f.name, protein: protein ?? 0, calories: calories ?? 0, quantity: f.quantity };
        target.foods.push(food);
        added.push(food);
      }
      mealNameOut = target.name;
      return day;
    }, emptyDailyNutrition(d));
    const targets = ((await readKey("cortex-nutrition-targets")) as McpNutritionTargets | null) ?? DEFAULT_TARGETS;
    const totals = nutritionTotals(day);
    return { ok: true, date: d, meal: mealNameOut, added, totals, targets, remaining: { protein: targets.protein - totals.protein, calories: targets.calories - totals.calories } };
  })
);

server.tool(
  "get_nutrition",
  "Get a day's Nutrition log (meals + totals vs targets) plus the pantry (loggable foods on hand).",
  { date: z.string().optional().describe("YYYY-MM-DD, defaults to today") },
  async ({ date }) => run(async () => {
    const d = date || today();
    const day: McpDailyNutrition = ((await readKey(`cortex-nutrition-${d}`)) as McpDailyNutrition | null) ?? emptyDailyNutrition(d);
    const targets = ((await readKey("cortex-nutrition-targets")) as McpNutritionTargets | null) ?? DEFAULT_TARGETS;
    const pantry: McpPantryItem[] = ((await readKey("cortex-nutrition-pantry")) as McpPantryItem[] | null) ?? [];
    const totals = nutritionTotals(day);
    return { date: d, meals: day.meals, waterLiters: day.waterLiters, totals, targets, remaining: { protein: targets.protein - totals.protein, calories: targets.calories - totals.calories }, pantry };
  })
);

server.tool(
  "get_market",
  "Get a week's Market grocery log with totals (by store and category) and the monthly grocery budget.",
  { date: z.string().optional().describe("Any date in the target week (YYYY-MM-DD), defaults to today") },
  async ({ date }) => run(async () => {
    const wk = weekStartMonday(date || today());
    const log: McpWeeklyMarketLog = ((await readKey(`cortex-market-${wk}`)) as McpWeeklyMarketLog | null) ?? { weekStart: wk, items: [] };
    const list = Array.isArray(log.items) ? log.items : [];
    const weekTotal = list.reduce((s, it) => s + it.price * it.quantity, 0);
    const byCategory: Record<string, number> = {};
    const byStore: Record<string, number> = {};
    for (const it of list) {
      byCategory[it.category] = (byCategory[it.category] || 0) + it.price * it.quantity;
      byStore[it.store] = (byStore[it.store] || 0) + it.price * it.quantity;
    }
    const monthlyBudget = ((await readKey("cortex-market-budget")) as number | null) ?? 646000;
    return { weekStart: wk, items: list, weekTotal, byCategory, byStore, monthlyBudget };
  })
);

server.tool(
  "create_meal_template",
  "Create a Nutrition meal template (appears on the Meal Plan tab and can be applied to a day).",
  {
    name: z.string().describe('e.g. "High Protein Weekday"'),
    description: z.string().optional(),
    meals: z.array(z.object({
      name: z.string().describe("Breakfast | Lunch | Dinner | Snack"),
      foods: z.array(z.object({
        name: z.string(),
        protein: z.number(),
        calories: z.number(),
        quantity: z.string().optional(),
      })),
    })).describe("The meals in this template"),
  },
  async ({ name, description, meals }) => run(async () => {
    const template: McpMealTemplate = {
      id: uid("tmpl"),
      name,
      description: description || "",
      meals: meals.map(m => ({ id: m.name.toLowerCase().replace(/\s+/g, "-"), name: m.name, foods: m.foods.map(f => ({ name: f.name, protein: f.protein, calories: f.calories, quantity: f.quantity })) })),
    };
    const templates = await mutateKey<McpMealTemplate[]>("cortex-meal-templates", (templates) => {
      templates.push(template);
      return templates;
    }, []);
    return { ok: true, template, totalTemplates: templates.length };
  })
);

server.tool(
  "build_market_list",
  "Build a suggested shopping list from previous Market purchases (item frequency + typical price/store/category across recent weeks) and save it to the Shopping List on the Market tab.",
  {
    weeks: z.number().optional().describe("How many recent weeks of buys to analyze. Default 8."),
    minTimes: z.number().optional().describe("Only include items bought at least this many times. Default 2."),
  },
  async ({ weeks, minTimes }) => run(async () => {
    const nWeeks = weeks && weeks > 0 ? Math.min(weeks, 52) : 8;
    const threshold = minTimes && minTimes > 0 ? minTimes : 2;
    const startMonday = new Date(weekStartMonday(today()) + "T00:00:00");
    interface Agg { name: string; prices: number[]; qtys: number[]; store: string; category: string; timesBought: number; lastBought: string }
    const map = new Map<string, Agg>();
    for (let i = 0; i < nWeeks; i++) {
      const m = new Date(startMonday);
      m.setDate(startMonday.getDate() - i * 7);
      const wk = localDateOf(m);
      const log = (await readKey(`cortex-market-${wk}`)) as McpWeeklyMarketLog | null;
      if (!log || !Array.isArray(log.items)) continue;
      for (const it of log.items) {
        const norm = it.name.trim().toLowerCase();
        const a = map.get(norm) ?? { name: it.name.trim(), prices: [], qtys: [], store: it.store, category: it.category, timesBought: 0, lastBought: wk };
        a.prices.push(it.price);
        a.qtys.push(it.quantity);
        a.timesBought += 1;
        if (it.store) a.store = it.store;
        if (it.category) a.category = it.category;
        if (wk > a.lastBought) a.lastBought = wk;
        map.set(norm, a);
      }
    }
    const median = (arr: number[]): number => { if (!arr.length) return 0; const s = [...arr].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const items: McpMarketListItem[] = [...map.values()]
      .filter(a => a.timesBought >= threshold)
      .sort((x, y) => y.timesBought - x.timesBought)
      .map(a => ({ name: a.name, price: median(a.prices), quantity: Math.round(median(a.qtys)) || 1, store: a.store, category: a.category, timesBought: a.timesBought, lastBought: a.lastBought, checked: false }));
    const marketList: McpMarketList = { generatedAt: new Date().toISOString(), weeksAnalyzed: nWeeks, items };
    await writeKey("cortex-market-list", marketList);
    return { ok: true, weeksAnalyzed: nWeeks, itemsFound: items.length, list: marketList };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP: Opportunity Radar
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Store key cortex-opportunities holds the whole OppData blob (items + hunt
// orders + report + run flags). Always read-modify-write the whole object so
// objectives/report/run state aren't clobbered. Shapes mirror
// src/features/opportunities/OpportunitiesPage.tsx.

interface McpOpportunity {
  id: string; title: string; host: string; category: string; goals: string[];
  priority: string; leverageScore: number; leverageNote: string; status: string;
  deadline: string | null; rolling: boolean; location: string; modality?: string;
  eligibility: string; reward: string; url: string; source: string; sourceRef: string;
  discoveredAt: string; runId?: string; notes: string; tags: string[];
  // Deadline intelligence (optional — legacy records derive them at read time)
  deadlineType?: string; recurrence?: string | null; nextWindowExpected?: string | null;
  amountUsd?: number | null; requires18Plus?: boolean | null; officialUrl?: string;
  effort?: string | null;
}
interface McpObjective { id: string; text: string; reply?: string; parsed?: unknown; status: string; active: boolean; createdAt: string; error?: string }
interface McpOppData {
  items: McpOpportunity[]; lastRun: string | null; lastRunId?: string; report?: string;
  objectives?: McpObjective[]; runRequestedAt?: string; runStatus?: string;
  runStartedAt?: string; runFinishedAt?: string; runError?: string;
}

const normOppUrl = (u: string): string => (u || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

// Normalize an item's deadline type (mirrors scripts/radar-lib.mjs + the UI):
// explicit valid value wins; legacy records derive rolling→'rolling',
// dated→'fixed', else 'unknown'.
const OPP_DEADLINE_TYPES = new Set(["fixed", "rolling", "recurring", "always-open", "unknown"]);
const oppDeadlineTypeOf = (o: McpOpportunity): string => {
  if (o.deadlineType && OPP_DEADLINE_TYPES.has(o.deadlineType)) return o.deadlineType;
  if (o.rolling === true) return "rolling";
  if (o.deadline) return "fixed";
  return "unknown";
};

server.tool(
  "get_opportunities",
  "Read the Opportunity Radar: sourced opportunities (hackathons AND the programs lane — fellowships, grants, accelerators, residencies), active hunt orders, the latest run report, and run status. Use before sourcing to avoid duplicates and to read what the user is hunting for. A curated 30-program catalog can be (re)seeded with `node scripts/radar-seed-programs.mjs --write`.",
  {
    status: z.string().optional().describe("Filter by status: new|pursuing|applied|won|lost|archived"),
    category: z.string().optional().describe("Filter by category (e.g. fellowship, grant, program, accelerator, hackathon)"),
    deadline_type: z.enum(["fixed", "rolling", "recurring", "always-open", "unknown"]).optional().describe("Filter by deadline behavior (legacy records derive it: rolling flag → rolling, dated → fixed, else unknown)"),
    limit: z.number().optional().describe("Max items to return, default 50"),
    includeArchived: z.boolean().optional().describe("Include archived items, default false"),
  },
  async ({ status, category, deadline_type, limit, includeArchived }) => run(async () => {
    const data = ((await readKey("cortex-opportunities")) as McpOppData | null) ?? { items: [], lastRun: null };
    let items = Array.isArray(data.items) ? data.items : [];
    if (!includeArchived) items = items.filter(o => o.status !== "archived");
    if (status) items = items.filter(o => o.status === status);
    if (category) items = items.filter(o => o.category === category);
    if (deadline_type) items = items.filter(o => oppDeadlineTypeOf(o) === deadline_type);
    const total = items.length;
    items = items.slice(0, limit && limit > 0 ? limit : 50);
    const activeHuntOrders = (data.objectives || []).filter(o => o.active).map(o => ({ id: o.id, text: o.text, status: o.status }));
    return { total, showing: items.length, items, activeHuntOrders, lastRun: data.lastRun, lastRunId: data.lastRunId, runStatus: data.runStatus, report: data.report };
  })
);

server.tool(
  "set_hunt_order",
  "Add a natural-language hunt order that personalizes the radar (e.g. '20 remote AI internships paying $2k+/mo, deadline before Sept'). Active hunt orders steer the next radar run.",
  { text: z.string().describe("What to hunt for, in plain language") },
  async ({ text }) => run(async () => {
    const objective: McpObjective = { id: `obj-${Date.now()}`, text, status: "thinking", active: true, createdAt: new Date().toISOString() };
    const data = await mutateKey<McpOppData>("cortex-opportunities", (data) => {
      if (!Array.isArray(data.objectives)) data.objectives = [];
      data.objectives.unshift(objective);
      return data;
    }, { items: [], lastRun: null });
    return { ok: true, objective, activeCount: (data.objectives || []).filter(o => o.active).length };
  })
);

server.tool(
  "run_opportunity_radar",
  "Trigger the native Opportunity Radar pipeline — the same as the app's 'Run radar' button. Requests a run that the local radar watcher executes (scrape → classify → ingest); the scrape runs natively on this Mac, so only the local watcher daemon needs to be up. Optionally pass a hunt order to personalize this run. To source opportunities WITHOUT the native scraper (Claude Code does its own web research), use add_opportunities instead.",
  { huntOrder: z.string().optional().describe("Optional plain-language focus for this run; added as an active hunt order first") },
  async ({ huntOrder }) => run(async () => {
    const requestedAt = new Date().toISOString();
    await mutateKey<McpOppData>("cortex-opportunities", (data) => {
      if (data.runStatus === "requested" || data.runStatus === "running") {
        throw new MutationAbort({ ok: false, alreadyRunning: true, runStatus: data.runStatus, message: "A radar run is already in progress." });
      }
      if (huntOrder && huntOrder.trim()) {
        if (!Array.isArray(data.objectives)) data.objectives = [];
        data.objectives.unshift({ id: `obj-${Date.now()}`, text: huntOrder.trim(), status: "thinking", active: true, createdAt: new Date().toISOString() });
      }
      data.runRequestedAt = requestedAt;
      data.runStatus = "requested";
      data.runError = undefined;
      return data;
    }, { items: [], lastRun: null });
    return { ok: true, runStatus: "requested", requestedAt, note: "The radar watcher (launchd) will run the pipeline. Poll runStatus via get_opportunities." };
  })
);

server.tool(
  "add_opportunities",
  "Add opportunities YOU (Claude Code) sourced via your own web research directly into the Radar. This IS the personalized radar when the external scraper isn't used: first read the user's profile (scripts/radar-profile.md) and active hunt orders (get_opportunities), research matching opportunities on the web, then submit them here. Fellowships, grants, accelerators, residencies and structured builder programs are first-class targets (categories program/fellowship/grant/accelerator/residency) — fill in the deadline-intelligence fields (deadlineType, recurrence, nextWindowExpected, amountUsd, requires18Plus, officialUrl, effort) whenever known. A curated 30-program baseline also exists: `node scripts/radar-seed-programs.mjs --write` (source 'catalog'). Dedupes against existing items by URL and title+host, stamps them with a runId, and updates the run report.",
  {
    runId: z.string().optional().describe("Label/stamp for this radar run; defaults to an ISO timestamp"),
    report: z.string().optional().describe("Optional markdown digest (what you found + top picks) shown on the Radar tab"),
    opportunities: z.array(z.object({
      title: z.string(),
      host: z.string().describe("Organization / host"),
      category: z.enum(["hackathon", "grant", "accelerator", "fellowship", "internship", "exchange", "competition", "pitch", "speaking", "scholarship", "community", "launch", "trending", "program", "residency", "research", "other"]),
      url: z.string().describe("Direct link"),
      goals: z.array(z.enum(["internship", "exchange", "funding", "social-growth", "users"])).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      leverageScore: z.number().min(1).max(5).optional().describe("1-5, how high-leverage for the user"),
      leverageNote: z.string().optional().describe("Why it matters for the user"),
      deadline: z.string().nullable().optional().describe("YYYY-MM-DD or null"),
      deadlineType: z.enum(["fixed", "rolling", "recurring", "always-open", "unknown"]).optional().describe("How the application window behaves; keeps the legacy rolling boolean in sync"),
      rolling: z.boolean().optional().describe("Legacy rolling flag — derived from deadlineType when that is provided"),
      recurrence: z.string().nullable().optional().describe("Cadence when known, e.g. 'annual', 'rolling cohorts', '2 batches/yr'"),
      nextWindowExpected: z.string().nullable().optional().describe("Freeform estimate of the next application window (mark estimates)"),
      amountUsd: z.number().nullable().optional().describe("Representative USD amount (grant/stipend/top prize) as a number, or null"),
      requires18Plus: z.boolean().nullable().optional().describe("true ONLY for an explicit 18+/legal-age rule; false when minors explicitly allowed; null/omit when unstated"),
      officialUrl: z.string().optional().describe("Canonical program homepage when identifiable (url stays the apply/discovery link)"),
      effort: z.enum(["low", "medium", "high"]).nullable().optional().describe("Application effort: low = form, medium = essays/submission, high = multi-stage"),
      location: z.string().optional().describe("City/country, or 'Remote'"),
      modality: z.enum(["remote", "hybrid", "in-person", "unknown"]).optional(),
      eligibility: z.enum(["remote-global", "latam", "us-eu", "other", "unknown"]).optional(),
      reward: z.string().optional().describe("Prize / stipend / reward"),
      source: z.enum(["x", "linkedin", "reddit", "instagram", "github", "devpost", "luma", "eventbrite", "meetup", "web", "manual", "catalog"]).optional(),
      sourceRef: z.string().optional().describe("Where you found it (handle, post URL, search)"),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })).describe("The opportunities you found"),
  },
  async ({ runId, report, opportunities }) => run(async () => {
    const stamp = runId || new Date().toISOString();
    const now = new Date().toISOString();
    let added: McpOpportunity[] = [];
    let skipped: string[] = [];
    let totalItems = 0;
    await mutateKey<McpOppData>("cortex-opportunities", (data) => {
      if (!Array.isArray(data.items)) data.items = [];
      const seenUrl = new Set(data.items.map(o => normOppUrl(o.url)).filter(Boolean));
      const seenTitleHost = new Set(data.items.map(o => `${(o.title || "").trim().toLowerCase()}|${(o.host || "").trim().toLowerCase()}`));
      added = [];
      skipped = [];
      for (const o of opportunities) {
        const u = normOppUrl(o.url);
        const th = `${o.title.trim().toLowerCase()}|${o.host.trim().toLowerCase()}`;
        if ((u && seenUrl.has(u)) || seenTitleHost.has(th)) { skipped.push(o.title); continue; }
        // Deadline intelligence: explicit deadlineType wins and re-derives the legacy
        // rolling boolean (rolling|always-open → true); legacy callers derive the type.
        const deadline = o.deadline ?? null;
        const deadlineType = o.deadlineType ?? (o.rolling ? "rolling" : deadline ? "fixed" : "unknown");
        const rolling = deadlineType === "rolling" || deadlineType === "always-open";
        const rec: McpOpportunity = {
          id: `opp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: o.title, host: o.host, category: o.category, goals: o.goals ?? [],
          priority: o.priority ?? "medium", leverageScore: o.leverageScore ?? 3, leverageNote: o.leverageNote ?? "",
          status: "new", deadline, deadlineType, rolling,
          recurrence: o.recurrence ?? null, nextWindowExpected: o.nextWindowExpected ?? null,
          amountUsd: o.amountUsd ?? null, requires18Plus: o.requires18Plus ?? null,
          officialUrl: o.officialUrl ?? "", effort: o.effort ?? null,
          location: o.location ?? "", modality: o.modality ?? "unknown", eligibility: o.eligibility ?? "unknown",
          reward: o.reward ?? "", url: o.url, source: o.source ?? "web", sourceRef: o.sourceRef ?? "",
          discoveredAt: now, runId: stamp, notes: o.notes ?? "", tags: o.tags ?? [],
        };
        data.items.unshift(rec);
        if (u) seenUrl.add(u);
        seenTitleHost.add(th);
        added.push(rec);
      }
      data.lastRun = now;
      data.lastRunId = stamp;
      if (report) data.report = report;
      totalItems = data.items.length;
      return data;
    }, { items: [], lastRun: null });
    return { ok: true, added: added.length, skippedDuplicates: skipped.length, skipped, runId: stamp, totalItems };
  })
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Start
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── HTTP access gate ─────────────────────────────────────
// Same policy as the Cortex app's :3456 web server (electron/main.ts):
// only localhost and the Tailscale CGNAT range (100.64.0.0/10) may connect.
// This keeps the phone-over-Tailscale MCP path working and blocks every
// LAN or other client. These tools read and write personal data, so an
// open socket here is full read/write for anyone who can reach the port.

function isTailscaleOrLocal(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, "");
  if (clean === "127.0.0.1" || clean === "::1") return true;
  const parts = clean.split(".");
  if (parts.length !== 4) return false;
  const first = parseInt(parts[0], 10);
  const second = parseInt(parts[1], 10);
  return first === 100 && second >= 64 && second <= 127;
}

// Reflect only origins we trust (mirrors getAllowedOrigin in electron/main.ts).
// Anything else gets no Access-Control-Allow-Origin header at all, never "*".
function getAllowedOrigin(req: IncomingMessage): string {
  const origin = req.headers.origin || "";
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  if (/^https?:\/\/(192\.168\.|10\.|100\.)/.test(origin)) return origin;
  if (/^https?:\/\/[a-z0-9-]+\.ts\.net(:\d+)?$/i.test(origin)) return origin;
  return "";
}

const httpMode = process.argv.includes("--http");

if (httpMode) {
  const PORT = parseInt(process.env.PORT || "3457");
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const httpServer = createServer(async (req, res) => {
    // IP gate first: reject anything that isn't localhost or the tailnet.
    const remote = req.socket.remoteAddress ?? "";
    if (!isTailscaleOrLocal(remote)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // CORS: only trusted origins are reflected; no header otherwise.
    const allowedOrigin = getAllowedOrigin(req);
    if (allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (req.url === "/mcp" || req.url === "/") {
      await transport.handleRequest(req, res);
    } else if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, tools: 78 })); // keep in sync with server.tool() count
    } else {
      res.writeHead(404); res.end("Not found");
    }
  });
  await server.connect(transport);
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.error(`Cortex MCP server (HTTP) listening on 0.0.0.0:${PORT}`);
    console.error(`  Local:     http://localhost:${PORT}/mcp`);
    console.error(`  Tailscale: http://100.85.207.62:${PORT}/mcp`);
  });
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
