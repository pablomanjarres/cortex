// Obsidian YAML frontmatter. Only flat scalar/list properties may be edited;
// richer metadata stays read-only. Body-only saves preserve the source block.

import { parseDocument, stringify } from 'yaml'

export type PropertyValue = string | number | boolean | null | PropertyValue[]
export type Properties = Record<string, PropertyValue>

export interface ParsedNote {
  properties: Properties
  body: string
  /** The raw frontmatter block including both `---` fences, or '' when absent. */
  rawFrontmatter: string
  /** True when the block had lines this parser could not represent. */
  complex: boolean
}

const FENCE = /^---\r?\n/
const PROPERTY_NAME = /^[^\s:#-][^:\r\n]*$/

export function parseNote(raw: string): ParsedNote {
  if (!FENCE.test(raw)) return { properties: {}, body: raw, rawFrontmatter: '', complex: false }
  const start = raw.indexOf('\n') + 1
  const close = /\r?\n---[ \t]*(?:\r?\n|$)/g
  close.lastIndex = start - 1
  const match = close.exec(raw)
  if (!match) return { properties: {}, body: raw, rawFrontmatter: '', complex: false }
  const block = raw.slice(start, match.index)
  const rawFrontmatter = raw.slice(0, match.index + match[0].length)
  const document = parseDocument(block, { schema: 'core', prettyErrors: false })
  const entries: [string, PropertyValue][] = []
  let complex = document.errors.length > 0 || document.warnings.length > 0
  try {
    const parsed: unknown = document.toJS({ mapAsMap: true, maxAliasCount: 100 })
    if (parsed instanceof Map) {
      for (const [name, value] of parsed) {
        if (typeof name !== 'string' || !PROPERTY_NAME.test(name) || !isPropertyValue(value)) { complex = true; continue }
        entries.push([name, value])
      }
    } else if (parsed !== null) complex = true
  } catch {
    complex = true
  }
  const properties: Properties = Object.fromEntries(entries)
  return { properties, body: raw.slice(rawFrontmatter.length), rawFrontmatter, complex }
}

export function serializeProperties(properties: Properties): string {
  for (const name of Object.keys(properties)) {
    if (!PROPERTY_NAME.test(name)) throw new Error(`Invalid property name: ${name}`)
  }
  return `---\n${stringify(properties, { lineWidth: 0 })}---\n`
}

/** Frontmatter + a blank line + body. `bodyOf` inverts this exactly. */
export function composeNote(properties: Properties, body: string): string {
  return `${serializeProperties(properties)}\n${body}\n`
}

/** Exact inverse of composeNote's body placement. */
export function bodyOf(parsed: ParsedNote): string {
  let body = parsed.body
  if (body.startsWith('\n')) body = body.slice(1)
  if (body.endsWith('\n')) body = body.slice(0, -1)
  return body
}

export function isPropertyValue(value: unknown): value is PropertyValue {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return typeof value !== 'number' || Number.isFinite(value)
  return Array.isArray(value) && value.length <= 200 && value.every(item => item === null || (['string', 'number', 'boolean'].includes(typeof item) && (typeof item !== 'number' || Number.isFinite(item))))
}
