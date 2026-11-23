// node --test scripts/research-prompt.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildResearchPrompt, researchSchema } from "./research-prompt.mjs"
import { researchInputs, toRecord } from "./opportunity-research.mjs"

test("the research run re-verifies watched items even when they fail the profile", () => {
  const watched = toRecord({ title: "Watched", url: "https://w.example.com", category: "fellowship", intel: { colombiaAllowed: false } }, "2026-11-21")
  const { tracked } = researchInputs({ items: [{ ...watched, id: "w", status: "watching" }] }, "2026-11-21")
  assert.deepEqual(tracked, ["Watched — https://w.example.com"])
})

test("research asks for recommendation letters as a nullable count", () => {
  const item = researchSchema().properties.opportunities.items
  assert.ok(item.required.includes("recommendationLetters"))
  assert.deepEqual(item.properties.recommendationLetters, { type: ["number", "null"] })
  const prompt = buildResearchPrompt({ profile: "", today: "2026-11-21", tracked: [], rejected: [], focus: [] })
  assert.match(prompt, /recommendationLetters/)
})

test("a research answer carries its recommendation letter count into the record", () => {
  assert.equal(toRecord({ title: "T", url: "https://t.example.com", recommendationLetters: 2 }, "2026-11-21").recommendationLetters, 2)
  assert.equal(toRecord({ title: "T", url: "https://t.example.com", recommendationLetters: null }, "2026-11-21").recommendationLetters, null)
})
