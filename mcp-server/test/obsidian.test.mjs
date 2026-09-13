import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  listVaults,
  listFiles,
  searchVault,
  readVaultFile,
} from "../dist/obsidian.js";

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cortex-obsidian-"));
  const vaultA = path.join(dir, "Life Project");
  const vaultB = path.join(dir, "Mars");
  const outside = path.join(dir, "outside.md");
  fs.mkdirSync(path.join(vaultA, "Database"), { recursive: true });
  fs.mkdirSync(path.join(vaultA, ".obsidian"), { recursive: true });
  fs.mkdirSync(vaultB, { recursive: true });
  fs.writeFileSync(outside, "outside");
  fs.writeFileSync(path.join(vaultA, "Daily.md"), "# Daily\nCanvas prep question\nsecond line\n");
  fs.writeFileSync(path.join(vaultA, "Database", "Prep.txt"), "prepare canvas cards\n");
  fs.writeFileSync(path.join(vaultA, "Database", "Attachment.pdf"), "pdf bytes");
  fs.writeFileSync(path.join(vaultA, ".obsidian", "workspace.json"), "{}");
  fs.writeFileSync(path.join(vaultA, "Scheme.canvas"), JSON.stringify({
    nodes: [
      { id: "g1", type: "group", x: 0, y: 0, width: 400, height: 240, label: "Prep" },
      { id: "t1", type: "text", x: 20, y: 20, width: 200, height: 80, text: "Canvas strategy card" },
      { id: "f1", type: "file", x: 250, y: 20, width: 120, height: 80, file: "Daily.md" },
    ],
    edges: [
      { id: "e1", fromNode: "t1", fromSide: "right", fromEnd: "arrow", toNode: "f1", toSide: "left", toEnd: "arrow", label: "uses" },
    ],
  }));
  fs.writeFileSync(path.join(vaultB, "Mars.md"), "red planet\n");
  fs.symlinkSync(outside, path.join(vaultA, "Escape.md"));
  const registry = path.join(dir, "obsidian.json");
  fs.writeFileSync(registry, JSON.stringify({
    vaults: {
      "life-id": { path: vaultA, ts: 10, open: true },
      "mars-id": { path: vaultB, ts: 20 },
    },
  }));
  return { dir, registry, vaultA, vaultB };
}

test("listVaults reads registry and returns stable ids without note bodies", () => {
  const fx = makeFixture();
  const result = listVaults({ registryPath: fx.registry });
  assert.deepEqual(result.vaults.map((v) => [v.id, v.name, v.open]), [
    ["life-id", "Life Project", true],
    ["mars-id", "Mars", false],
  ]);
  assert.equal(result.vaults[0].counts.contentFiles, 4);
  assert.equal(result.vaults[0].counts.markdown, 1);
  assert.equal(result.vaults[0].counts.canvas, 1);
  assert.equal(result.vaults[0].counts.attachments, 1);
  assert.equal("body" in result.vaults[0], false);
});

test("OBSIDIAN_VAULTS overrides registry and updates when source changes", () => {
  const fx = makeFixture();
  const envVaults = JSON.stringify([{ id: "manual", name: "Manual", path: fx.vaultB }]);
  const first = listVaults({ registryPath: fx.registry, envVaults });
  const second = listVaults({ registryPath: fx.registry, envVaults: JSON.stringify([{ id: "life-id", path: fx.vaultA }]) });
  assert.deepEqual(first.vaults.map((v) => v.id), ["manual"]);
  assert.deepEqual(second.vaults.map((v) => v.id), ["life-id"]);
});

test("listFiles hides config, paginates, and exposes attachment metadata only", () => {
  const fx = makeFixture();
  const page1 = listFiles({ registryPath: fx.registry, limit: 2 });
  const page2 = listFiles({ registryPath: fx.registry, cursor: page1.nextCursor, limit: 10 });
  assert.deepEqual(page1.files.map((f) => f.path), ["Daily.md", "Database/Attachment.pdf"]);
  assert.deepEqual(page2.files.map((f) => f.path), ["Database/Prep.txt", "Scheme.canvas"]);
  assert.equal(page2.files.some((f) => f.path.startsWith(".obsidian/")), false);
  assert.equal(page1.files[1].kind, "attachment");
  assert.equal("text" in page1.files[1], false);
});

test("searchVault searches markdown, txt, filenames, and canvas cards", () => {
  const fx = makeFixture();
  const result = searchVault({ registryPath: fx.registry, query: "canvas", limit: 10 });
  assert.deepEqual(result.matches.map((m) => [m.path, m.kind]).sort(), [
    ["Daily.md", "text"],
    ["Database/Prep.txt", "text"],
    ["Scheme.canvas", "canvas-node"],
    ["Scheme.canvas", "filename"],
  ]);
});

test("readVaultFile parses markdown pages and canvas geometry without silent truncation", () => {
  const fx = makeFixture();
  const md = readVaultFile({ registryPath: fx.registry, path: "Daily.md", limit: 2 });
  const canvas = readVaultFile({ registryPath: fx.registry, path: "Scheme.canvas", includeText: true, limit: 2 });
  const canvasPage2 = readVaultFile({ registryPath: fx.registry, path: "Scheme.canvas", includeText: true, cursor: canvas.nextCursor, limit: 5 });
  assert.deepEqual(md, {
    vaultId: "life-id",
    path: "Daily.md",
    kind: "markdown",
    lines: ["# Daily", "Canvas prep question"],
    nextCursor: "2",
    totalLines: 3,
  });
  assert.equal(canvas.kind, "canvas");
  assert.equal(canvas.nodes.length, 2);
  assert.deepEqual(canvas.nodes[0], { id: "g1", type: "group", x: 0, y: 0, width: 400, height: 240, label: "Prep" });
  assert.equal(canvas.nodes[1].text, "Canvas strategy card");
  assert.deepEqual(canvasPage2.nodes.map((n) => n.id), ["f1"]);
  assert.equal(canvasPage2.edges[0].fromEnd, "arrow");
});

test("readVaultFile blocks traversal, hidden config paths, unsupported content, and symlink escapes", () => {
  const fx = makeFixture();
  assert.throws(() => readVaultFile({ registryPath: fx.registry, path: "../outside.md" }), /stays inside the vault/);
  assert.throws(() => readVaultFile({ registryPath: fx.registry, path: ".obsidian/workspace.json" }), /hidden or config paths/);
  assert.throws(() => readVaultFile({ registryPath: fx.registry, path: "Database/Attachment.pdf" }), /Only Markdown, text, and Canvas/);
  assert.throws(() => readVaultFile({ registryPath: fx.registry, path: "Escape.md" }), /symlink escapes/);
});
