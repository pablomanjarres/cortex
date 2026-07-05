// Exercise demonstration media from the public-domain (Unlicense) yuhonas/free-exercise-db,
// served via the jsDelivr CDN — no API key. Each exercise has ~2 jpgs (start / end of the
// movement) which we cycle for a pseudo-GIF. Matching is fuzzy on the exercise name so the
// user's free-text plan names ("DB Lateral Raises", "Barbell Row (Pendlay)") resolve.

const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main'

export interface ExerciseMedia {
  name: string
  images: string[] // full CDN urls, in movement order
  primaryMuscles: string[]
  equipment?: string
  level?: string
}

interface DbEntry {
  name: string
  images: string[]
  primaryMuscles?: string[]
  equipment?: string | null
  level?: string
}

let db: DbEntry[] | null = null
let loadPromise: Promise<DbEntry[]> | null = null
const memo = new Map<string, ExerciseMedia | null>()

// Expand common gym abbreviations; drop filler words that hurt matching.
const ABBR: Record<string, string> = { db: 'dumbbell', bb: 'barbell', ohp: 'overhead press', rdl: 'romanian deadlift', bw: 'bodyweight' }
const STOP = new Set(['the', 'a', 'with', 'and', 'to', 'per', 'each', 'hold', 'x', 'of', 'standing', 'seated'])
// Generic modifier / equipment / common-movement words. A match that shares ONLY these
// isn't meaningful (e.g. "Neck Flexion" must not match "Hip Flexion" on "flexion" alone).
const GENERIC = new Set([
  'barbell', 'dumbbell', 'cable', 'machine', 'smith', 'band', 'weighted', 'bodyweight', 'body', 'weight',
  'lying', 'bent', 'incline', 'decline', 'flat', 'press', 'raise', 'raises', 'extension', 'flexion', 'lateral',
  'fly', 'flyes', 'crossover', 'pushdown', 'pull', 'push', 'front', 'rear', 'side', 'reverse', 'close', 'wide',
  'grip', 'medium', 'narrow', 'one', 'two', 'single', 'arm', 'arms', 'high', 'low', 'up', 'down', 'alternate', 'alternating',
])

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // drop parentheticals like "(Pendlay)"
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .flatMap((t) => (ABBR[t] || t).split(' '))
    .filter((t) => t && !STOP.has(t))
}

async function loadDb(): Promise<DbEntry[]> {
  if (db) return db
  if (loadPromise) return loadPromise
  loadPromise = fetch(`${CDN}/dist/exercises.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((data: DbEntry[]) => {
      db = Array.isArray(data) ? data : []
      return db
    })
    .catch(() => {
      db = []
      return db
    })
  return loadPromise
}

// Best DB entry for a single (non-compound) name, or null if no confident, MEANINGFUL match:
// shared tokens must include a non-generic word, and cover ≥half the query's specific tokens.
function bestMatch(entries: DbEntry[], name: string): { entry: DbEntry; score: number } | null {
  const q = tokenize(name)
  if (!q.length) return null
  const qSpecific = q.filter((t) => !GENERIC.has(t))
  let best: DbEntry | null = null
  let bestScore = 0
  for (const e of entries) {
    const n = tokenize(e.name)
    if (!n.length) continue
    const shared = q.filter((t) => n.includes(t))
    if (!shared.length) continue
    const sharedSpecific = shared.filter((t) => !GENERIC.has(t))
    if (qSpecific.length > 0) {
      if (sharedSpecific.length < 1) continue // must share a meaningful token
      if (sharedSpecific.length / qSpecific.length < 0.5) continue // and cover half of them
    } else if (shared.length < 2) {
      continue // all-generic query: require ≥2 shared tokens
    }
    const union = new Set([...q, ...n]).size
    const score = shared.length / union
    if (score > bestScore) {
      bestScore = score
      best = e
    }
  }
  return best && bestScore >= 0.3 ? { entry: best, score: bestScore } : null
}

/** Best fuzzy match for a free-text exercise name → demo media, or null if none is confident. */
export async function findExerciseMedia(name: string): Promise<ExerciseMedia | null> {
  const key = name.trim().toLowerCase()
  if (memo.has(key)) return memo.get(key)!
  const entries = await loadDb()
  let result: ExerciseMedia | null = null
  if (entries.length) {
    // Compound "A / B" or "A or B" names: match each side, keep the best.
    const parts = name.split(/\/| or /i).map((s) => s.trim()).filter(Boolean)
    let picked: { entry: DbEntry; score: number } | null = null
    for (const part of parts.length > 1 ? parts : [name]) {
      const m = bestMatch(entries, part)
      if (m && (!picked || m.score > picked.score)) picked = m
    }
    if (picked && picked.entry.images?.length) {
      const best = picked.entry
      result = {
        name: best.name,
        images: best.images.map((i) => `${CDN}/exercises/${i}`),
        primaryMuscles: best.primaryMuscles || [],
        equipment: best.equipment || undefined,
        level: best.level,
      }
    }
  }
  memo.set(key, result)
  return result
}

// Plate breakdown per side for a barbell load (kg). platesPerSide(60) -> [20] on a 20kg bar.
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]
export function platesPerSide(totalKg: number, barKg = 20): number[] {
  let perSide = (totalKg - barKg) / 2
  if (perSide <= 0) return []
  const out: number[] = []
  for (const p of PLATES) {
    while (perSide >= p - 1e-9) {
      out.push(p)
      perSide = +(perSide - p).toFixed(3)
    }
  }
  return out
}
