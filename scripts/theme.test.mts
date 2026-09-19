import { test } from "node:test"
import assert from "node:assert/strict"
import { readStoredThemePreference, resolveThemePreference, themeColorFor, writeStoredThemePreference } from "../src/lib/theme"

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

test("blocked localStorage getter falls back without preventing startup", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("storage blocked") },
  })
  try {
    assert.equal(readStoredThemePreference(), "dark")
    assert.doesNotThrow(() => writeStoredThemePreference("light"))
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original)
    else Reflect.deleteProperty(globalThis, "localStorage")
  }
})
