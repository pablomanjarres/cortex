// Shared Student-domain types + store keys + normalizers. Course/Topic/
// Assignment moved out of StudentPage.tsx unchanged so the Materials and
// Notes tabs (and the deleteCourse cascade) can share them.

// ── Types ────────────────────────────────────────────────────────────────────

export type Difficulty = 'Hard' | 'Medium' | 'Easy'
export type AssignmentType = 'Exam' | 'Quiz' | 'Lab' | 'Project' | 'Presentation' | 'Attendance'
export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent'
export type SortKey = 'deadline' | 'weight' | 'grade' | 'name'
export type CourseStatus = 'Normal' | 'At risk' | 'Under Control'

export type TopicStatus = 'Not seen' | 'Previewed' | 'Seen' | 'Practiced' | 'Mastered'

// Courses are persisted as data (JSON), so the icon is stored as a string key
// and resolved to a lucide component at render time.
export interface Course {
  id: string
  name: string
  difficulty: Difficulty
  iconKey: string
  /** Legacy per-course identity hues — still present in old persisted data but
   *  no longer written or rendered (categories are text, urgency is color). */
  color?: string
  bg?: string
  semester: string
  status: CourseStatus
  credits: number
  notes?: string
}

export interface Topic {
  id: string
  name: string
  courseId: string
  chapter: string
  types: string[]
  mastery: number
  status: TopicStatus
  priority: Priority
  week?: number
}

export interface Assignment {
  id: string
  name: string
  courseId: string
  type: AssignmentType
  weight: number
  grade?: number
  deadline?: string
  done: boolean
  priority: Priority
  notes?: string
}

// ── Study hub (class materials + study notes) ───────────────────────────────

export const CLASS_MATERIALS_KEY = 'cortex-class-materials'
export const STUDY_NOTES_KEY = 'cortex-study-notes'

/** Binary bytes live in the media store — only this ref sits in the JSON store. */
export interface MaterialFile {
  mediaId: string
  name: string
  mime: string
  size: number
}

export interface ClassMaterial {
  id: string                      // `mat-${Date.now()}-${rand4}`
  courseId: string                // ties to cortex-student-courses item id
  kind: 'file' | 'link' | 'text'
  name: string                    // display name (defaults: filename / url host+path / first words)
  unit?: string                   // free text: "Unidad 1", "Contenidos generales" …
  description?: string
  tags: string[]
  file?: MaterialFile             // kind === 'file'
  url?: string                    // kind === 'link'
  text?: string                   // kind === 'text'
  addedAt: string                 // ISO datetime
  source: 'app' | 'mcp'
}

export interface StudyNote {
  id: string                      // `note-${Date.now()}-${rand4}`
  courseId?: string               // undefined = general (not tied to one course)
  courseName?: string             // denormalized snapshot (survives course rename/delete)
  text: string
  tags: string[]
  pinned: boolean
  source: 'claude' | 'manual'     // 'claude' = saved via MCP, 'manual' = typed in the app
  context?: string                // optional: what was being worked on when captured
  createdAt: string               // ISO datetime
  updatedAt?: string
}

const rand4 = () => Math.random().toString(36).slice(2, 6)
export const matId = () => `mat-${Date.now()}-${rand4()}`
export const noteId = () => `note-${Date.now()}-${rand4()}`

// ── Normalizers (run at READ time — never persisted back on load) ───────────

export function normalizeMaterial(raw: Partial<ClassMaterial>): ClassMaterial {
  const kind: ClassMaterial['kind'] =
    raw.kind === 'file' || raw.kind === 'link' || raw.kind === 'text'
      ? raw.kind
      : raw.file ? 'file' : 'text'
  return {
    ...raw,
    id: raw.id ?? matId(),
    courseId: raw.courseId ?? '',
    kind,
    name: raw.name ?? 'Untitled',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    addedAt: raw.addedAt ?? new Date().toISOString(),
    source: raw.source === 'mcp' ? 'mcp' : 'app',
  }
}

export function normalizeNote(raw: Partial<StudyNote>): StudyNote {
  return {
    ...raw,
    id: raw.id ?? noteId(),
    text: raw.text ?? '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    pinned: raw.pinned === true,
    source: raw.source === 'claude' ? 'claude' : 'manual',
    createdAt: raw.createdAt ?? new Date().toISOString(),
  }
}

export const normalizeMaterials = (raw: Partial<ClassMaterial>[]): ClassMaterial[] =>
  (Array.isArray(raw) ? raw : []).map(normalizeMaterial)

export const normalizeNotes = (raw: Partial<StudyNote>[]): StudyNote[] =>
  (Array.isArray(raw) ? raw : []).map(normalizeNote)

// ── Shared helpers ───────────────────────────────────────────────────────────

export const getToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
export const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Case- and diacritic-insensitive text key (course names are Spanish). */
export const normText = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim()

/**
 * Brightspace unit ordering: "Contenidos generales" first, then "Unidad N"
 * numeric ascending, then other named units alphabetical. The empty string
 * (un-united "General" bucket) sorts LAST. Matching is normText-insensitive.
 */
export function compareUnits(a: string, b: string): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const na = normText(a)
  const nb = normText(b)
  const rank = (n: string) => (n === 'contenidos generales' ? 0 : /^unidad \d+$/.test(n) ? 1 : 2)
  const ra = rank(na)
  const rb = rank(nb)
  if (ra !== rb) return ra - rb
  if (ra === 1) return parseInt(na.slice('unidad '.length), 10) - parseInt(nb.slice('unidad '.length), 10)
  return na.localeCompare(nb)
}
