export type ThemePreference = "dark" | "light"

export const THEME_STORAGE_KEY = "cortex-ui-theme"

const THEME_COLORS: Record<ThemePreference, string> = {
  dark: "#141720",
  light: "#F1F2F7",
}

export function resolveThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "dark"
}

export function themeColorFor(theme: ThemePreference): string {
  return THEME_COLORS[theme]
}

export function readStoredThemePreference(storage = globalThis.localStorage): ThemePreference {
  try {
    return resolveThemePreference(storage.getItem(THEME_STORAGE_KEY))
  } catch {
    return "dark"
  }
}

export function writeStoredThemePreference(theme: ThemePreference, storage = globalThis.localStorage) {
  try {
    storage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Cosmetic preference only; a blocked localStorage write should not break Settings.
  }
}

export function applyThemePreference(theme: ThemePreference, documentRef = globalThis.document) {
  documentRef.documentElement.classList.toggle("dark", theme === "dark")
  documentRef.documentElement.dataset.theme = theme
  documentRef
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", themeColorFor(theme))
}

export function applyStoredThemePreference() {
  const theme = readStoredThemePreference()
  applyThemePreference(theme)
  return theme
}
