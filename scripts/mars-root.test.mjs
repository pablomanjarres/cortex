import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveMarsRoot } from "../dist-electron/integrations/mars.js";

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cortex-mars-root-"));
  const mars = path.join(dir, "Mars");
  const life = path.join(dir, "Life Project");
  fs.mkdirSync(path.join(mars, "content"), { recursive: true });
  fs.mkdirSync(life, { recursive: true });
  const registry = path.join(dir, "obsidian.json");
  fs.writeFileSync(registry, JSON.stringify({
    vaults: {
      life: { path: life, open: true, ts: 20 },
      mars: { path: mars, ts: 10 },
    },
  }));
  return { registry, mars };
}

test("resolveMarsRoot keeps explicit env override first", () => {
  const fx = fixture();
  const override = path.join(fx.mars, "override");
  assert.equal(resolveMarsRoot({ envRoot: override, registryPath: fx.registry }), override);
});

test("resolveMarsRoot discovers the registered Mars vault before legacy defaults", () => {
  const fx = fixture();
  assert.equal(resolveMarsRoot({ envRoot: "", registryPath: fx.registry }), fx.mars);
});
