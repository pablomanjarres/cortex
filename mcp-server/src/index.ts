import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "http";
import { z } from "zod";

const BASE = "http://localhost:3456";

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

async function readKey<T = unknown>(key: string): Promise<T> {
  return cortexGet(`/api/data?key=${encodeURIComponent(key)}`) as Promise<T>;
}

async function writeKey(key: string, data: unknown): Promise<void> {
  await cortexPost("/api/data", { key, data });
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
    const error = e as Error & { cause?: { code?: string } };
    if (error?.cause?.code === "ECONNREFUSED" || error?.message?.includes("ECONNREFUSED")) {
      return err("Cortex app is not running. Start the Cortex Electron app first (it hosts the API on localhost:3456).");
    }
    return err(`Error: ${error?.message ?? e}`);
  }
}

// ─── Server ──────────────────────────────────────────────

const server = new McpServer({
  name: "cortex",
  version: "1.0.0",
  description: "Personal dashboard for auditing your days — habits, books, captures, CRM, calendar, GTM, finance, and more.",
});

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
    const sessions = ((await readKey(key)) || []) as unknown[];
    const session = {
      id: uid("session"),
      task,
      duration,
      startedAt: startedAt || new Date().toISOString(),
      completedAt: completedAt || new Date().toISOString(),
    };
    (sessions as unknown[]).push(session);
    await writeKey(key, sessions);
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
    const key = "cortex-habits-history";
    const history = ((await readKey(key)) || {}) as Record<string, Record<string, boolean>>;
    if (!history[d]) history[d] = {};
    history[d][habitId] = done ?? true;
    await writeKey(key, history);
    return { ok: true, date: d, habitId, done: history[d][habitId] };
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
    const books = ((await readKey("cortex-books")) || []) as unknown[];
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
    books.push(book);
    await writeKey("cortex-books", books);
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
    const books = ((await readKey("cortex-books")) || []) as Record<string, unknown>[];
    const book = books.find(b => b.id === id);
    if (!book) return { error: `Book ${id} not found` };
    Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) book[k] = v; });
    await writeKey("cortex-books", books);
    return { ok: true, book };
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
    const caps = ((await readKey("cortex-captures")) || []) as unknown[];
    const capture = {
      id: uid("cap"),
      title,
      content,
      source,
      url: url || "",
      images: [],
      createdAt: new Date().toISOString(),
    };
    caps.push(capture);
    await writeKey("cortex-captures", caps);
    return { ok: true, capture };
  })
);

server.tool(
  "delete_capture",
  "Delete a capture by ID",
  { id: z.string() },
  async ({ id }) => run(async () => {
    const caps = ((await readKey("cortex-captures")) || []) as Record<string, unknown>[];
    const filtered = caps.filter(c => c.id !== id);
    if (filtered.length === caps.length) return { error: `Capture ${id} not found` };
    await writeKey("cortex-captures", filtered);
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
    const thoughts = ((await readKey("cortex-thoughts")) || []) as unknown[];
    const thought = {
      id: uid("thought"),
      name,
      subline: subline || "",
      topic: topic || "",
      book: book || "",
      highValue: highValue ?? false,
      createdAt: new Date().toISOString(),
    };
    thoughts.push(thought);
    await writeKey("cortex-thoughts", thoughts);
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
    const thoughts = ((await readKey("cortex-thoughts")) || []) as Record<string, unknown>[];
    const thought = thoughts.find(t => t.id === id);
    if (!thought) return { error: `Thought ${id} not found` };
    Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) thought[k] = v; });
    await writeKey("cortex-thoughts", thoughts);
    return { ok: true, thought };
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
    const contacts = ((await readKey("cortex-contacts")) || []) as unknown[];
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
    contacts.push(contact);
    await writeKey("cortex-contacts", contacts);
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
    const contacts = ((await readKey("cortex-contacts")) || []) as Record<string, unknown>[];
    const contact = contacts.find(c => c.id === id);
    if (!contact) return { error: `Contact ${id} not found` };
    Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) contact[k] = v; });
    await writeKey("cortex-contacts", contacts);
    return { ok: true, contact };
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
    const crm = ((await readKey("cortex-crm")) || { organizations: [] }) as Record<string, unknown>;
    const orgs = (crm.organizations || []) as Record<string, unknown>[];
    const org = orgs.find(o => o.id === orgId);
    if (!org) return { error: `Organization ${orgId} not found` };
    const contacts = (org.contacts || []) as unknown[];
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
    contacts.push(contact);
    org.contacts = contacts;
    await writeKey("cortex-crm", crm);
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
    const crm = ((await readKey("cortex-crm")) || { organizations: [] }) as Record<string, unknown>;
    const orgs = (crm.organizations || []) as Record<string, unknown>[];
    for (const org of orgs) {
      const contacts = (org.contacts || []) as Record<string, unknown>[];
      const contact = contacts.find(c => c.id === contactId);
      if (contact) {
        Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) contact[k] = v; });
        await writeKey("cortex-crm", crm);
        return { ok: true, contact };
      }
    }
    return { error: `Contact ${contactId} not found in any organization` };
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
    const existing = ((await readKey(key)) || {
      date: d, dmsSent: 0, dmResponses: 0, demoCalls: 0, xReplies: 0,
      xFollowers: 0, redditComments: 0, linkedinMessages: 0, postsPublished: 0,
      channelOfSignup: "", notes: "",
    }) as Record<string, unknown>;
    Object.entries(metrics).forEach(([k, v]) => { if (v !== undefined) existing[k] = v; });
    existing.date = d;
    await writeKey(key, existing);
    return { ok: true, log: existing };
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
// GROUP 16: Content Pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server.tool(
  "get_content_pipeline",
  "Get daily content pipeline state (video/post ideas, drafts, published items)",
  {},
  async () => run(() => readKey("cortex-content-pipeline-daily"))
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
// Start
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const httpMode = process.argv.includes("--http");

if (httpMode) {
  const PORT = parseInt(process.env.PORT || "3457");
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const httpServer = createServer(async (req, res) => {
    // CORS
    const origin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (req.url === "/mcp" || req.url === "/") {
      await transport.handleRequest(req, res);
    } else if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, tools: 50 }));
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
