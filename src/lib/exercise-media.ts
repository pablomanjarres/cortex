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

/** Best fuzzy match for a free-text exercise name → demo media, or null if none is confident. */
export async function findExerciseMedia(name: string): Promise<ExerciseMedia | null> {
  const key = name.trim().toLowerCase()
  if (memo.has(key)) return memo.get(key)!
  const entries = await loadDb()
  const q = tokenize(name)
  if (!q.length || !entries.length) {
    memo.set(key, null)
    return null
  }
  let best: DbEntry | null = null
  let bestScore = 0
  for (const e of entries) {
    const n = tokenize(e.name)
    if (!n.length) continue
    const inter = q.filter((t) => n.includes(t)).length
    if (!inter) continue
    const union = new Set([...q, ...n]).size
    const score = inter / union + inter * 0.01 // Jaccard + tiny bonus for more shared tokens
    if (score > bestScore) {
      bestScore = score
      best = e
    }
  }
  const result: ExerciseMedia | null =
    best && bestScore >= 0.34 && best.images?.length
      ? {
          name: best.name,
          images: best.images.map((i) => `${CDN}/exercises/${i}`),
          primaryMuscles: best.primaryMuscles || [],
          equipment: best.equipment || undefined,
          level: best.level,
        }
      : null
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
