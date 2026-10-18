// Minimal Obsidian property (YAML frontmatter) reader/writer. Supports the
// flat scalar and list properties Obsidian's Properties UI produces. Anything
// richer is reported as `complex` so callers can refuse to re-serialize it and
// keep the original block byte-for-byte instead.

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
const KEY_LINE = /^([^\s:#-][^:]*?):(?:[ \t]+(.*))?$/
const LIST_ITEM = /^[ \t]+-[ \t]*(.*)$/

function scalar(raw: string): PropertyValue {
  const value = raw.trim()
  if (value === '' || value === '~' || value === 'null') return null
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
  if (value.startsWith('"') || value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (typeof parsed === 'string') return parsed
      if (Array.isArray(parsed) && parsed.every(item => item === null || ['string', 'number', 'boolean'].includes(typeof item))) return parsed as PropertyValue[]
    } catch { /* fall through to a plain string */ }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'")
  return value
}

export function parseNote(raw: string): ParsedNote {
  if (!FENCE.test(raw)) return { properties: {}, body: raw, rawFrontmatter: '', complex: false }
  const start = raw.indexOf('\n') + 1
  const close = /\r?\n---[ \t]*(?:\r?\n|$)/g
  close.lastIndex = start - 1
  const match = close.exec(raw)
  if (!match) return { properties: {}, body: raw, rawFrontmatter: '', complex: false }
  const block = raw.slice(start, match.index)
  const rawFrontmatter = raw.slice(0, match.index + match[0].length)
  const properties: Properties = {}
  let complex = false
  let listKey: string | null = null
  for (const line of block.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const item = line.match(LIST_ITEM)
    if (item && listKey) {
      const current = properties[listKey]
      properties[listKey] = [...(Array.isArray(current) ? current : []), scalar(item[1])]
      continue
    }
    const key = line.match(KEY_LINE)
    if (!key) { complex = true; listKey = null; continue }
    const name = key[1].trim()
    // `key:` alone is an empty property until list items follow it.
    listKey = key[2] === undefined || key[2].trim() === '' ? name : null
    properties[name] = listKey ? null : scalar(key[2])
  }
  return { properties, body: raw.slice(rawFrontmatter.length), rawFrontmatter, complex }
}

const PLAIN = /^[A-Za-z0-9_][A-Za-z0-9_ ./:+@-]*$/
function formatScalar(value: PropertyValue): string {
  if (value === null) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value !== 'string') return JSON.stringify(value)
  const plain = PLAIN.test(value) && !value.endsWith(' ') && !value.includes(': ') && !/^(?:true|false|null|yes|no|on|off|~|-?\d+(?:\.\d+)?)$/i.test(value)
  return plain ? value : JSON.stringify(value)
}

export function serializeProperties(properties: Properties): string {
  const lines = ['---']
  for (const [name, value] of Object.entries(properties)) {
    if (!/^[^\s:#-][^:\r\n]*$/.test(name)) throw new Error(`Invalid property name: ${name}`)
    if (Array.isArray(value)) {
      lines.push(`${name}:`)
      for (const item of value) lines.push(`  - ${formatScalar(item)}`)
    } else {
      const formatted = formatScalar(value)
      lines.push(formatted ? `${name}: ${formatted}` : `${name}:`)
    }
  }
  lines.push('---', '')
  return lines.join('\n')
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
