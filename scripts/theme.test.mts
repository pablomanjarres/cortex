import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveThemePreference, themeColorFor } from "../src/lib/theme"

test("theme preference defaults unknown and missing values to dark", () => {
  assert.equal(resolveThemePreference(null), "dark")
  assert.equal(resolveThemePreference(undefined), "dark")
  assert.equal(resolveThemePreference("system"), "dark")
  assert.equal(resolveThemePreference(""), "dark")
})

test("theme preference preserves explicit light and dark values", () => {
  assert.equal(resolveThemePreference("light"), "light")
  assert.equal(resolveThemePreference("dark"), "dark")
})

test("theme metadata uses the matching canvas color", () => {
  assert.equal(themeColorFor("dark"), "#141720")
  assert.equal(themeColorFor("light"), "#F1F2F7")
})
