import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type VaultRecord = { id: string; name: string; path: string; open: boolean; ts?: number };
type Opts = { registryPath?: string; envVaults?: string; vaultId?: string };

const READ_EXT = new Set([".md", ".markdown", ".txt", ".canvas"]);
const TEXT_EXT = new Set([".md", ".markdown", ".txt"]);
const SKIP_DIRS = new Set([".git", ".obsidian", "node_modules", ".trash"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function limitOf(n?: number) {
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(n ?? DEFAULT_LIMIT)));
}

function offsetOf(cursor?: string) {
  const n = Number.parseInt(cursor || "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function hashId(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function registryPaths() {
  const home = os.homedir();
  const paths = [
    path.join(home, "Library", "Application Support", "obsidian", "obsidian.json"),
    path.join(home, ".config", "obsidian", "obsidian.json"),
  ];
  if (process.env.APPDATA) paths.push(path.join(process.env.APPDATA, "obsidian", "obsidian.json"));
  return paths;
}

function parseEnvVaults(raw?: string): VaultRecord[] | null {
  const value = raw ?? process.env.OBSIDIAN_VAULTS;
  if (!value?.trim()) return null;
  try {
    const rows = JSON.parse(value) as Array<{ id?: string; name?: string; path: string; open?: boolean }>;
    return rows.map((v) => vaultRecord(v.id, v.path, !!v.open, undefined, v.name));
  } catch {
    return value.split(path.delimiter).filter(Boolean).map((p) => vaultRecord(undefined, p, false));
  }
}

function vaultRecord(id: string | undefined, rawPath: string, open: boolean, ts?: number, name?: string): VaultRecord {
  const full = path.resolve(rawPath);
  return { id: id || `path-${hashId(full)}`, name: name || path.basename(full), path: full, open, ts };
}

function loadVaults(opts: Opts = {}): VaultRecord[] {
  const manual = parseEnvVaults(opts.envVaults);
  if (manual) return manual.filter((v) => isDir(v.path));
  const registry = opts.registryPath || registryPaths().find((p) => fs.existsSync(p));
  if (!registry) return [];
  const json = JSON.parse(fs.readFileSync(registry, "utf8")) as { vaults?: Record<string, { path: string; open?: boolean; ts?: number }> };
  return Object.entries(json.vaults || {})
    .map(([id, v]) => vaultRecord(id, v.path, !!v.open, v.ts))
    .filter((v) => isDir(v.path))
    .sort((a, b) => Number(b.open) - Number(a.open) || (b.ts ?? 0) - (a.ts ?? 0) || a.name.localeCompare(b.name));
}

function isDir(p: string) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function pickVault(opts: Opts = {}) {
  const vaults = loadVaults(opts);
  if (vaults.length === 0) throw new Error("No Obsidian vaults found.");
  if (!opts.vaultId) return vaults.find((v) => v.open) || vaults[0];
  const match = vaults.find((v) => v.id === opts.vaultId || v.name === opts.vaultId);
  if (!match) throw new Error(`No Obsidian vault matches "${opts.vaultId}".`);
  return match;
}

function kindOf(rel: string) {
  const ext = path.extname(rel).toLowerCase();
  if (ext === ".canvas") return "canvas";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".txt") return "text";
  return "attachment";
}

function safePath(vault: VaultRecord, rel: string, forRead = false) {
  const clean = rel.replaceAll("\\", "/");
  const parts = clean.split("/").filter(Boolean);
  if (path.isAbsolute(clean) || parts.includes("..")) throw new Error("Path stays inside the vault.");
  if (parts.some((p) => p.startsWith(".")) || parts.some((p) => SKIP_DIRS.has(p))) {
    throw new Error("Obsidian hidden or config paths are not readable.");
  }
  const full = path.resolve(vault.path, ...parts);
  const rootReal = fs.realpathSync(vault.path);
  let real: string;
  try { real = fs.realpathSync(full); } catch { throw new Error(`No file found at "${rel}".`); }
  if (real !== rootReal && !real.startsWith(`${rootReal}${path.sep}`)) throw new Error("Path symlink escapes the vault.");
  const realParts = path.relative(rootReal, real).split(path.sep).filter(Boolean);
  if (realParts.some((p) => p.startsWith(".") || SKIP_DIRS.has(p))) {
    throw new Error("Obsidian hidden or config paths are not readable.");
  }
  if (!full.startsWith(`${path.resolve(vault.path)}${path.sep}`) && full !== path.resolve(vault.path)) {
    throw new Error("Path stays inside the vault.");
  }
  const ext = path.extname(full).toLowerCase();
  if (forRead && !READ_EXT.has(ext)) throw new Error("Only Markdown, text, and Canvas files can be read.");
  return full;
}

function walkFiles(vault: VaultRecord) {
  const out: Array<{ path: string; kind: string; size: number; mtime: string }> = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        const rel = path.relative(vault.path, full).split(path.sep).join("/");
        const st = fs.statSync(full);
        out.push({ path: rel, kind: kindOf(rel), size: st.size, mtime: new Date(st.mtimeMs).toISOString() });
      }
    }
  };
  walk(vault.path);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function countVault(vault: VaultRecord) {
  const files = walkFiles(vault);
  return {
    contentFiles: files.length,
    markdown: files.filter((f) => f.kind === "markdown").length,
    text: files.filter((f) => f.kind === "text").length,
    canvas: files.filter((f) => f.kind === "canvas").length,
    attachments: files.filter((f) => f.kind === "attachment").length,
  };
}

export function listVaults(opts: Opts = {}) {
  return { vaults: loadVaults(opts).map((v) => ({ ...v, counts: countVault(v) })) };
}

export function listFiles(opts: Opts & { query?: string; extensions?: string[]; cursor?: string; limit?: number } = {}) {
  const vault = pickVault(opts);
  const q = opts.query?.toLowerCase();
  const exts = opts.extensions?.map((e) => e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`);
  let files = walkFiles(vault);
  if (q) files = files.filter((f) => f.path.toLowerCase().includes(q));
  if (exts?.length) files = files.filter((f) => exts.includes(path.extname(f.path).toLowerCase()));
  const start = offsetOf(opts.cursor), limit = limitOf(opts.limit);
  return { vaultId: vault.id, files: files.slice(start, start + limit), nextCursor: start + limit < files.length ? String(start + limit) : null, total: files.length };
}

function canvas(raw: string) {
  const parsed = JSON.parse(raw) as { nodes?: Record<string, unknown>[]; edges?: Record<string, unknown>[] };
  return { nodes: parsed.nodes || [], edges: parsed.edges || [] };
}

function lineMatches(vault: VaultRecord, file: { path: string; kind: string }, q: string, limit: number, matches: unknown[]) {
  const full = safePath(vault, file.path);
  if (TEXT_EXT.has(path.extname(file.path).toLowerCase())) {
    fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
      if (matches.length < limit && line.toLowerCase().includes(q)) matches.push({ vaultId: vault.id, path: file.path, kind: "text", line: i + 1, snippet: line.trim().slice(0, 240) });
    });
  } else if (file.kind === "canvas") {
    for (const n of canvas(fs.readFileSync(full, "utf8")).nodes) {
      const text = typeof n.text === "string" ? n.text : typeof n.label === "string" ? n.label : "";
      if (matches.length < limit && text.toLowerCase().includes(q)) matches.push({ vaultId: vault.id, path: file.path, kind: "canvas-node", nodeId: n.id, snippet: text.slice(0, 240) });
    }
  }
}

export function searchVault(opts: Opts & { query: string; extensions?: string[]; cursor?: string; limit?: number }) {
  const vault = pickVault(opts);
  const q = opts.query.trim().toLowerCase();
  if (!q) return { vaultId: vault.id, query: opts.query, matches: [], nextCursor: null, total: 0 };
  const limit = limitOf(opts.limit), start = offsetOf(opts.cursor), all: unknown[] = [];
  const exts = opts.extensions?.map((e) => e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`);
  const files = walkFiles(vault).filter((f) => !exts?.length || exts.includes(path.extname(f.path).toLowerCase()));
  for (const file of files) {
    if (file.path.toLowerCase().includes(q)) all.push({ vaultId: vault.id, path: file.path, kind: "filename", snippet: file.path });
    lineMatches(vault, file, q, Number.MAX_SAFE_INTEGER, all);
  }
  return { vaultId: vault.id, query: opts.query, matches: all.slice(start, start + limit), nextCursor: start + limit < all.length ? String(start + limit) : null, total: all.length };
}

export function readVaultFile(opts: Opts & { path: string; cursor?: string; offset?: number; limit?: number; includeText?: boolean }) {
  const vault = pickVault(opts);
  const full = safePath(vault, opts.path, true);
  const rel = path.relative(vault.path, full).split(path.sep).join("/");
  const kind = kindOf(rel);
  const start = opts.offset ?? offsetOf(opts.cursor), limit = limitOf(opts.limit);
  if (kind === "canvas") {
    const parsed = canvas(fs.readFileSync(full, "utf8"));
    const nodes = parsed.nodes.slice(start, start + limit).map((n) => {
      const { id, type, x, y, width, height, color, label, file, subpath, url, background, text } = n;
      return {
        id, type, x, y, width, height,
        ...(color !== undefined ? { color } : {}),
        ...(label !== undefined ? { label } : {}),
        ...(file !== undefined ? { file } : {}),
        ...(subpath !== undefined ? { subpath } : {}),
        ...(url !== undefined ? { url } : {}),
        ...(background !== undefined ? { background } : {}),
        ...(opts.includeText && text !== undefined ? { text } : {}),
      };
    });
    const ids = new Set(nodes.map((n) => n.id));
    const edges = parsed.edges.filter((e) => ids.has(e.fromNode) || ids.has(e.toNode));
    return { vaultId: vault.id, path: rel, kind, nodes, edges, nextCursor: start + limit < parsed.nodes.length ? String(start + limit) : null, totalNodes: parsed.nodes.length, totalEdges: parsed.edges.length };
  }
  const lines = fs.readFileSync(full, "utf8").replace(/\n$/, "").split("\n");
  return { vaultId: vault.id, path: rel, kind, lines: lines.slice(start, start + limit), nextCursor: start + limit < lines.length ? String(start + limit) : null, totalLines: lines.length };
}
