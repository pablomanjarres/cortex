#!/usr/bin/env node
// radar-parse-output — extract the JSON object a tool-less classifier produced and split
// it into classified.json (opportunities array) + report.md. Robust to code fences and
// surrounding prose. Exits non-zero if no valid object is found.
//
// Usage: node radar-parse-output.mjs <model-output.txt> <out-classified.json> <out-report.md>

import { readFile, writeFile } from "node:fs/promises"

const [inPath, clsPath, repPath] = process.argv.slice(2)
if (!inPath || !clsPath || !repPath) {
  console.error("usage: radar-parse-output.mjs <model.txt> <classified.json> <report.md>")
  process.exit(2)
}

const raw = await readFile(inPath, "utf8")

// Prefer a fenced ```json block; else the outermost {...}.
function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start) return null
  const slice = candidate.slice(start, end + 1)
  try { return JSON.parse(slice) } catch { return null }
}

const parsed = extractJson(raw)
if (!parsed || typeof parsed !== "object") {
  console.error("radar-parse-output: no JSON object in model output")
  process.exit(1)
}

const opportunities = Array.isArray(parsed.opportunities) ? parsed.opportunities : []
const report = typeof parsed.report === "string" ? parsed.report : ""

await writeFile(clsPath, JSON.stringify(opportunities), "utf8")
await writeFile(repPath, report, "utf8")
console.error(`radar-parse-output: ${opportunities.length} opportunities, report ${report.length} chars`)
