/**
 * Semantic search over class materials — Voyage contextualized embeddings +
 * a local JSON vector index.
 *
 * Mirrors noelle's `voyageContextEmbed` wire shape (verified working client):
 *   POST <endpoint>/contextualizedembeddings
 *   req:  { inputs: string[][], model, input_type, output_dimension }
 *         — `inputs` is an array of DOCUMENTS, each an array of its CHUNKS.
 *   res:  { data: [ { index: <docIdx>, data: [ { index: <chunkIdx>, embedding } ] } ] }
 *
 * Unlike noelle's fail-open client, this one THROWS friendly errors — the MCP
 * `run()` wrapper surfaces them to the caller. Credential VALUES are never
 * logged or echoed anywhere; error messages use env-var NAMES only.
 *
 * Index file: ~/Library/Application Support/cortex-mcp/materials-index.json
 * (dir overridable via CORTEX_MCP_INDEX_DIR). Loaded lazily, cosine similarity
 * in-process. A corrupt/unreadable index is treated as "no index" and is
 * rebuilt from scratch by index_class_materials.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ─── Types (store shapes duplicated from index.ts — the two files share no exports
// to avoid an import cycle with the server entrypoint) ──────────────────────────

export interface SearchMaterialFile { mediaId: string; name: string; mime: string; size: number }
export interface SearchMaterial {
  id: string;
  courseId: string;
  kind: "file" | "link" | "text";
  name: string;
  unit?: string;
  description?: string;
  tags: string[];
  file?: SearchMaterialFile;
  url?: string;
  text?: string;
  addedAt: string;
}
export interface SearchCourse { id: string; name: string; semester?: string }

interface IndexChunk {
  materialId: string;
  courseId: string;
  unit: string;
  name: string;
  idx: number;
  text: string;
  vector: number[];
}
interface MaterialsIndex {
  version: number;
  model: string;
  builtAt: string;
  chunks: IndexChunk[];
}

export interface IndexResult {
  indexed: number;   // materials (re)embedded this run
  skipped: number;   // materials unchanged (chunks reused)
  removed: number;   // materials pruned (no longer in the store)
  chunks: number;    // chunks embedded this run
  totalChunks: number;
  model: string;
  indexPath: string;
}

export interface SearchHit {
  materialId: string;
  name: string;
  course: string;
  unit: string;
  score: number;
  chunk: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BASE = process.env.CORTEX_API || "http://localhost:3456";
const INDEX_VERSION = 1;
const MODEL = "voyage-context-4";
const OUTPUT_DIMENSION = 1024;
const DEFAULT_ENDPOINT = "https://api.voyageai.com/v1";
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const MATERIAL_TEXT_CAP = 200_000; // chars per material
// Batch packing for the contextualized endpoint: keep requests comfortably
// under the model's context budget (chunks ≈ 400 tokens each). The model has a
// hard 32k-token PER-DOCUMENT window, so a long material is sliced into
// multiple documents of ≤ DOC_MAX_CHARS (~17k tokens at ~3.5 chars/token) —
// context awareness is lost across slice boundaries, which is acceptable.
const DOC_MAX_CHARS = 60_000;
const BATCH_MAX_CHUNKS = 64;
const BATCH_MAX_CHARS = 220_000;
const VOYAGE_TIMEOUT_MS = 60_000;
const MEDIA_TIMEOUT_MS = 15_000;

const TEXT_FILE_EXT = new Set(["md", "txt", "markdown", "text"]);

// Same case/diacritic normalizer as index.ts (course/unit names are Spanish).
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();

function indexDir(): string {
  return process.env.CORTEX_MCP_INDEX_DIR || path.join(os.homedir(), "Library", "Application Support", "cortex-mcp");
}
function indexPath(): string {
  return path.join(indexDir(), "materials-index.json");
}

// ─── Credentials (env first, then ~/.noelle/.env — VALUES are never logged) ─

function parseEnvFile(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

async function resolveVoyageCreds(): Promise<{ apiKey: string; endpoint: string }> {
  let apiKey = process.env.VOYAGE_API_KEY;
  let endpoint = process.env.VOYAGE_CONTEXT_ENDPOINT;
  if (!apiKey || !endpoint) {
    try {
      const fileEnv = parseEnvFile(await fs.readFile(path.join(os.homedir(), ".noelle", ".env"), "utf8"));
      apiKey = apiKey || fileEnv.VOYAGE_API_KEY;
      endpoint = endpoint || fileEnv.VOYAGE_CONTEXT_ENDPOINT;
    } catch {
      // No ~/.noelle/.env — env vars were the only source.
    }
  }
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is missing — set it in the environment or in ~/.noelle/.env to enable semantic search.");
  }
  return { apiKey, endpoint: (endpoint || DEFAULT_ENDPOINT).replace(/\/$/, "") };
}

// ─── Voyage client ──────────────────────────────────────────────────────────

interface VoyageContextResponse {
  data?: Array<{ index: number; data?: Array<{ index: number; embedding: number[] }> }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Contextually embed `documents` (each an array of chunks). Returns one
 * number[][] per document, a vector per chunk, positionally aligned.
 * Retries 429/5xx with backoff; throws a friendly Error otherwise.
 */
async function voyageEmbed(documents: string[][], inputType: "document" | "query"): Promise<number[][][]> {
  if (documents.length === 0) return [];
  const { apiKey, endpoint } = await resolveVoyageCreds();
  const url = `${endpoint}/contextualizedembeddings`;
  const body = JSON.stringify({ inputs: documents, model: MODEL, input_type: inputType, output_dimension: OUTPUT_DIMENSION });

  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body,
        signal: AbortSignal.timeout(VOYAGE_TIMEOUT_MS),
      });
    } catch (e) {
      if (attempt < MAX_ATTEMPTS) { await sleep(1000 * 2 ** (attempt - 1)); continue; }
      const name = (e as Error)?.name;
      throw new Error(name === "TimeoutError" || name === "AbortError"
        ? `Voyage embedding request timed out after ${VOYAGE_TIMEOUT_MS / 1000}s.`
        : "Voyage embedding request failed (network error).");
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get("retry-after")) || 0;
        await sleep(Math.max(retryAfter * 1000, 1000 * 2 ** (attempt - 1)));
        continue;
      }
      throw new Error(`Voyage API ${res.status} after ${MAX_ATTEMPTS} attempts — rate-limited or unavailable, try again later.`);
    }
    if (!res.ok) {
      // 4xx: surface a short server-side reason. Never echoes credentials.
      let detail = "";
      try {
        const j = (await res.json()) as { detail?: string; error?: { message?: string } };
        detail = (j?.detail || j?.error?.message || "").slice(0, 200);
      } catch { /* body unreadable — status alone */ }
      throw new Error(`Voyage API ${res.status}${detail ? `: ${detail}` : ""} (check VOYAGE_API_KEY / VOYAGE_CONTEXT_ENDPOINT — names, not values).`);
    }

    const json = (await res.json()) as VoyageContextResponse;
    if (!Array.isArray(json?.data)) throw new Error("Voyage API returned an unexpected response shape.");
    const out: number[][][] = documents.map((doc) => new Array<number[]>(doc.length));
    for (const docRow of json.data) {
      const di = docRow?.index;
      if (typeof di !== "number" || di < 0 || di >= documents.length || !Array.isArray(docRow.data)) continue;
      for (const cr of docRow.data) {
        const ci = cr?.index;
        if (typeof ci === "number" && ci >= 0 && ci < documents[di].length && Array.isArray(cr.embedding)) {
          out[di][ci] = cr.embedding;
        }
      }
    }
    for (let di = 0; di < documents.length; di++) {
      for (let ci = 0; ci < documents[di].length; ci++) {
        if (!out[di][ci]) throw new Error("Voyage API response was missing embeddings for some chunks.");
      }
    }
    return out;
  }
}

async function embedQuery(query: string): Promise<number[]> {
  const out = await voyageEmbed([[query]], "query");
  const vec = out[0]?.[0];
  if (!vec || vec.length === 0) throw new Error("Voyage API returned no embedding for the query.");
  return vec;
}

// ─── Text extraction + chunking ─────────────────────────────────────────────

function isTextFile(m: SearchMaterial): boolean {
  if (!m.file) return false;
  const ext = path.extname(m.file.name).slice(1).toLowerCase();
  return TEXT_FILE_EXT.has(ext) || m.file.mime.startsWith("text/") || m.file.mime === "application/json";
}

/** Metadata-only body for links, binary files, and media-fetch failures. */
function metadataBody(m: SearchMaterial): string {
  return [m.name, m.description || "", m.tags.join(" "), m.url || ""].filter(Boolean).join("\n");
}

/** Fetch a text file's bytes from the app's media store and decode to utf8. */
async function fetchMediaText(mediaId: string): Promise<string> {
  const res = await fetch(`${BASE}/api/media?id=${encodeURIComponent(mediaId)}`, {
    signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Cortex media ${res.status}`);
  const dataUrl = (await res.json()) as string | null;
  if (dataUrl === null) throw new Error("media bytes missing");
  const s = String(dataUrl);
  const i = s.indexOf("base64,");
  return Buffer.from(i >= 0 ? s.slice(i + 7) : s, "base64").toString("utf8");
}

/** The embeddable body text for a material (capped at MATERIAL_TEXT_CAP chars). */
async function materialBody(m: SearchMaterial): Promise<string> {
  let body: string;
  if (m.kind === "text" && m.text) {
    body = m.text;
  } else if (m.kind === "file" && m.file && isTextFile(m)) {
    try {
      body = await fetchMediaText(m.file.mediaId);
    } catch {
      body = metadataBody(m); // media unavailable — degrade to metadata, never fail the run
    }
  } else {
    body = metadataBody(m);
  }
  body = body.trim() || m.name;
  return body.length > MATERIAL_TEXT_CAP ? body.slice(0, MATERIAL_TEXT_CAP) : body;
}

/** ~1500-char windows with 200-char overlap. */
function chunkBody(body: string): string[] {
  if (body.length <= CHUNK_SIZE) return [body];
  const chunks: string[] = [];
  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  for (let start = 0; start < body.length; start += step) {
    chunks.push(body.slice(start, start + CHUNK_SIZE));
    if (start + CHUNK_SIZE >= body.length) break;
  }
  return chunks;
}

/** Small header prepended to every chunk before embedding (not stored). */
function chunkHeader(m: SearchMaterial, courseName: string): string {
  const parts = [`curso: ${courseName}`];
  if (m.unit) parts.push(`unidad: ${m.unit}`);
  parts.push(`material: ${m.name}`);
  if (m.tags.length) parts.push(`tags: ${m.tags.join(", ")}`);
  return `[${parts.join(" | ")}]`;
}

// ─── Index persistence (lazy load + atomic write; corruption → rebuild) ─────

let cache: { mtimeMs: number; index: MaterialsIndex } | null = null;

function validIndex(x: unknown): x is MaterialsIndex {
  const i = x as MaterialsIndex;
  return !!i && typeof i === "object" && typeof i.model === "string" && Array.isArray(i.chunks) &&
    i.chunks.every((c) => c && typeof c.materialId === "string" && typeof c.text === "string" && Array.isArray(c.vector));
}

/** Load the index, or null when absent/corrupt/stale-versioned (callers rebuild). */
async function loadIndex(): Promise<MaterialsIndex | null> {
  const file = indexPath();
  let stat;
  try { stat = await fs.stat(file); } catch { cache = null; return null; }
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.index;
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    if (!validIndex(parsed) || parsed.version !== INDEX_VERSION) { cache = null; return null; }
    cache = { mtimeMs: stat.mtimeMs, index: parsed };
    return parsed;
  } catch {
    cache = null;
    return null; // corrupt JSON → treated as no index; index_class_materials rebuilds
  }
}

async function saveIndex(index: MaterialsIndex): Promise<void> {
  const dir = indexDir();
  await fs.mkdir(dir, { recursive: true });
  const file = indexPath();
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, JSON.stringify(index));
  await fs.rename(tmp, file); // atomic swap — a crashed write never corrupts the live index
  const stat = await fs.stat(file).catch(() => null);
  if (stat) cache = { mtimeMs: stat.mtimeMs, index };
}

// ─── Build / refresh ────────────────────────────────────────────────────────

interface PreparedMaterial {
  m: SearchMaterial;
  courseName: string;
  chunks: string[]; // raw chunk texts (header applied only at embed time)
}

const courseNameOf = (courses: SearchCourse[], courseId: string) =>
  courses.find((c) => c.id === courseId)?.name || courseId;

/** Unchanged = same chunk count, texts, unit, and name as what's indexed. */
function unchanged(existing: IndexChunk[], prep: PreparedMaterial): boolean {
  if (existing.length !== prep.chunks.length) return false;
  const unit = prep.m.unit || "General";
  const sorted = [...existing].sort((a, b) => a.idx - b.idx);
  return sorted.every((c, i) => c.text === prep.chunks[i] && c.unit === unit && c.name === prep.m.name);
}

/** One Voyage DOCUMENT: a contiguous slice of a material's chunks that fits the
 * model's per-document context window. `offset` maps back to chunk indices. */
interface DocSlice { it: PreparedMaterial; offset: number; texts: string[] }

/** Slice materials into per-document windows, then pack slices into requests
 * (≤ BATCH_MAX_CHUNKS / BATCH_MAX_CHARS each). */
function packBatches(items: PreparedMaterial[]): DocSlice[][] {
  const slices: DocSlice[] = [];
  for (const it of items) {
    const header = chunkHeader(it.m, it.courseName);
    let texts: string[] = [], chars = 0, offset = 0;
    it.chunks.forEach((c, ci) => {
      const text = `${header}\n${c}`;
      if (texts.length > 0 && chars + text.length > DOC_MAX_CHARS) {
        slices.push({ it, offset, texts });
        texts = []; chars = 0; offset = ci;
      }
      texts.push(text);
      chars += text.length;
    });
    if (texts.length > 0) slices.push({ it, offset, texts });
  }

  const batches: DocSlice[][] = [];
  let current: DocSlice[] = [];
  let chunks = 0, chars = 0;
  for (const s of slices) {
    const sChars = s.texts.reduce((sum, t) => sum + t.length, 0);
    if (current.length > 0 && (chunks + s.texts.length > BATCH_MAX_CHUNKS || chars + sChars > BATCH_MAX_CHARS)) {
      batches.push(current);
      current = []; chunks = 0; chars = 0;
    }
    current.push(s);
    chunks += s.texts.length; chars += sChars;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function embedPrepared(items: PreparedMaterial[]): Promise<IndexChunk[]> {
  const out: IndexChunk[] = [];
  for (const batch of packBatches(items)) {
    const vectors = await voyageEmbed(batch.map((s) => s.texts), "document");
    batch.forEach((s, di) => {
      s.texts.forEach((_, ti) => {
        const ci = s.offset + ti;
        out.push({
          materialId: s.it.m.id,
          courseId: s.it.m.courseId,
          unit: s.it.m.unit || "General",
          name: s.it.m.name,
          idx: ci,
          text: s.it.chunks[ci],
          vector: vectors[di][ti],
        });
      });
    });
  }
  return out;
}

/**
 * Build or refresh the index. `materials` must be ALL materials (pruning of
 * deleted ones is global); `scopeCourseId` limits which materials get
 * (re)embedded — out-of-scope chunks are carried over untouched.
 */
export async function buildMaterialsIndex(
  materials: SearchMaterial[],
  courses: SearchCourse[],
  opts: { force?: boolean; scopeCourseId?: string } = {},
): Promise<IndexResult> {
  const existing = (await loadIndex()) ?? { version: INDEX_VERSION, model: MODEL, builtAt: "", chunks: [] };
  const existingByMaterial = new Map<string, IndexChunk[]>();
  if (existing.model === MODEL) {
    for (const c of existing.chunks) {
      if (!existingByMaterial.has(c.materialId)) existingByMaterial.set(c.materialId, []);
      existingByMaterial.get(c.materialId)!.push(c);
    }
  }

  const liveIds = new Set(materials.map((m) => m.id));
  const removed = [...existingByMaterial.keys()].filter((id) => !liveIds.has(id)).length;

  const inScope = opts.scopeCourseId ? materials.filter((m) => m.courseId === opts.scopeCourseId) : materials;
  const toEmbed: PreparedMaterial[] = [];
  const keep: IndexChunk[] = [];
  let skipped = 0;

  // Out-of-scope materials keep their existing chunks verbatim.
  if (opts.scopeCourseId) {
    for (const m of materials) {
      if (m.courseId === opts.scopeCourseId) continue;
      keep.push(...(existingByMaterial.get(m.id) ?? []));
    }
  }

  for (const m of inScope) {
    const prep: PreparedMaterial = { m, courseName: courseNameOf(courses, m.courseId), chunks: [] };
    prep.chunks = chunkBody(await materialBody(m));
    const prior = existingByMaterial.get(m.id);
    if (!opts.force && prior && unchanged(prior, prep)) {
      keep.push(...prior);
      skipped++;
    } else {
      toEmbed.push(prep);
    }
  }

  const fresh = await embedPrepared(toEmbed);
  const next: MaterialsIndex = {
    version: INDEX_VERSION,
    model: MODEL,
    builtAt: new Date().toISOString(),
    chunks: [...keep, ...fresh],
  };
  await saveIndex(next);
  return {
    indexed: toEmbed.length,
    skipped,
    removed,
    chunks: fresh.length,
    totalChunks: next.chunks.length,
    model: MODEL,
    indexPath: indexPath(),
  };
}

/**
 * Best-effort incremental index of ONE just-added material. Appends to an
 * existing index only (a missing index means the user never opted in — a full
 * index_class_materials run creates it). Callers must try/catch — this can
 * throw (no creds, Voyage down) and must never fail the add.
 */
export async function indexMaterialIncremental(m: SearchMaterial, courseName: string): Promise<void> {
  const existing = await loadIndex();
  if (!existing || existing.model !== MODEL) return;
  const prep: PreparedMaterial = { m, courseName, chunks: chunkBody(await materialBody(m)) };
  const fresh = await embedPrepared([prep]);
  const next: MaterialsIndex = {
    ...existing,
    builtAt: new Date().toISOString(),
    chunks: [...existing.chunks.filter((c) => c.materialId !== m.id), ...fresh],
  };
  await saveIndex(next);
}

// ─── Search ─────────────────────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

export async function searchMaterialsIndex(
  query: string,
  courses: SearchCourse[],
  opts: { courseId?: string; unit?: string; k?: number } = {},
): Promise<{ hits: SearchHit[]; totalChunks: number; model: string; builtAt: string }> {
  if (!query.trim()) throw new Error("query is required.");
  const index = await loadIndex();
  if (!index || index.chunks.length === 0) {
    throw new Error("No semantic index yet — run index_class_materials first to build it.");
  }
  let chunks = index.chunks;
  if (opts.courseId) chunks = chunks.filter((c) => c.courseId === opts.courseId);
  if (opts.unit) {
    const u = norm(opts.unit);
    chunks = chunks.filter((c) => norm(c.unit) === u);
  }
  const qv = await embedQuery(query.trim());
  const k = Math.max(1, Math.min(opts.k ?? 8, 50));
  const scored = chunks
    .map((c) => ({ c, score: cosine(qv, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return {
    hits: scored.map(({ c, score }) => ({
      materialId: c.materialId,
      name: c.name,
      course: courseNameOf(courses, c.courseId),
      unit: c.unit,
      score: Math.round(score * 10000) / 10000,
      chunk: c.text,
    })),
    totalChunks: index.chunks.length,
    model: index.model,
    builtAt: index.builtAt,
  };
}
