import { useState, useMemo, useCallback, useRef } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/shared/Skeleton'
import { Modal } from '@/components/shared/Modal'
import { StatTile } from '@/components/shared/StatTile'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'
import { localDate } from '@/lib/date-utils'
import { saveFile, loadFile, deleteFile, fileToDataUrl, formatBytes, extFor } from '@/lib/media'
import {
  CLASS_MATERIALS_KEY, STUDY_NOTES_KEY, matId, noteId, normalizeMaterials, normalizeNotes,
  compareUnits, normText, getToday, daysUntil, fmtDate,
  type Assignment, type ClassMaterial, type Course, type MaterialFile, type StudyNote,
} from './student-types'
import { ICONS } from './course-icons'
import {
  GraduationCap, Upload, Link2, StickyNote, FileText, Image as ImageIcon, Eye,
  ExternalLink, Pencil, Trash2, Download, CalendarDays, Layers, ClipboardList, Pin,
} from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────

// Size caps: 50 MB per file through the Electron IPC media backend, 15 MB
// through the HTTP fallback (the server body cap is 25 MB incl. base64 overhead).
const maxUploadBytes = () => (window.electronAPI?.media ? 50 : 15) * 1024 * 1024

/** Pull a URL + title out of a drag payload (dragging a link / article). */
function readDraggedLink(dt: DataTransfer): { url: string; title: string } | null {
  const uriList = dt.getData('text/uri-list')
  const plain = dt.getData('text/plain')
  const html = dt.getData('text/html')
  const url = (uriList.split('\n').find(l => l && !l.startsWith('#')) || plain || '').trim()
  if (!/^https?:\/\//i.test(url)) return null
  let title = ''
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    title = (doc.querySelector('a')?.textContent || doc.body.textContent || '').trim()
  }
  if (!title) { try { title = new URL(url).hostname.replace(/^www\./, '') } catch { title = url } }
  return { url, title: title.slice(0, 200) }
}

/** Default display name for a link material: host + path. */
function linkName(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, '')}${u.pathname !== '/' ? u.pathname : ''}`
  } catch { return url }
}

/** Default display name for a text material: its first words. */
const textName = (t: string) => t.trim().split(/\s+/).slice(0, 6).join(' ') || 'Untitled'

const parseTags = (s: string) => s.split(',').map(t => t.trim()).filter(Boolean)

const isImageFile = (f?: MaterialFile) => !!f && f.mime.startsWith('image/')
const isPdfFile = (f?: MaterialFile) => !!f && f.mime === 'application/pdf'

const kindGlyph = (m: ClassMaterial) =>
  m.kind === 'link' ? Link2 : m.kind === 'text' ? StickyNote : isImageFile(m.file) ? ImageIcon : FileText

// ── Add/edit modal draft ─────────────────────────────────────────────────────

interface EditorState {
  id: string | null                 // null = creating
  kind: ClassMaterial['kind']
  name: string
  unit: string
  description: string
  tags: string
  url: string
  text: string
  file?: MaterialFile               // read-only meta when editing a file material
}

// ── Component ────────────────────────────────────────────────────────────────

export function MaterialsTab() {
  const [courses] = useStore<Course[]>('cortex-student-courses', [])
  const [activeSemester] = useStore<string>('cortex-student-active-semester', '')
  const [assignments] = useStore<Assignment[]>('cortex-student-assignments', [])
  const [rawMaterials, updateMaterials] = useStore<ClassMaterial[]>(CLASS_MATERIALS_KEY, [])
  const [rawNotes, updateNotes] = useStore<StudyNote[]>(STUDY_NOTES_KEY, [])

  // Normalize legacy/partial records at read time (never persisted back).
  const materials = useMemo(() => normalizeMaterials(rawMaterials), [rawMaterials])
  const notes = useMemo(() => normalizeNotes(rawNotes), [rawNotes])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [unitFilter, setUnitFilter] = useState<string | null>(null) // normText key
  const [cache, setCache] = useState<Record<string, string>>({}) // media id → data URL
  const [pageDrag, setPageDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [lightbox, setLightbox] = useState<ClassMaterial | null>(null)
  const [pdfView, setPdfView] = useState<ClassMaterial | null>(null)
  const [quickNote, setQuickNote] = useState('')
  const dragDepth = useRef(0)

  // Rail = active-semester courses; fall back to all when the filter matches none.
  const railCourses = useMemo(() => {
    const inTerm = courses.filter((c) => c.semester === activeSemester)
    return inTerm.length ? inTerm : courses
  }, [courses, activeSemester])

  const course = railCourses.find((c) => c.id === selectedId) ?? railCourses[0] ?? null

  const countByCourse = useMemo(() => {
    const m: Record<string, number> = {}
    for (const mat of materials) m[mat.courseId] = (m[mat.courseId] || 0) + 1
    return m
  }, [materials])

  const courseMaterials = useMemo(
    () => materials.filter((m) => course && m.courseId === course.id),
    [materials, course],
  )

  // Group by unit (normText-merged so "Unidad 1" and "unidad 1" file together).
  const unitGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: ClassMaterial[] }>()
    for (const m of courseMaterials) {
      const label = m.unit?.trim() ?? ''
      const key = normText(label)
      let g = map.get(key)
      if (!g) { g = { key, label: label || 'General', items: [] }; map.set(key, g) }
      g.items.push(m)
    }
    for (const g of map.values()) g.items.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    return [...map.values()].sort((a, b) => compareUnits(a.key && a.label, b.key && b.label))
  }, [courseMaterials])

  // Self-clear a stale filter whose group vanished (e.g. its last material was
  // deleted or re-filed) — otherwise the list goes blank with the chips hidden.
  const effectiveFilter =
    unitFilter !== null && unitGroups.some((g) => g.key === unitFilter) ? unitFilter : null
  const visibleGroups = effectiveFilter === null ? unitGroups : unitGroups.filter((g) => g.key === effectiveFilter)
  const namedUnits = unitGroups.filter((g) => g.key !== '').map((g) => g.label)
  const unitFilterLabel = effectiveFilter ? (unitGroups.find((g) => g.key === effectiveFilter)?.label ?? '') : ''

  const courseNotes = useMemo(
    () => notes.filter((n) => course && n.courseId === course.id),
    [notes, course],
  )
  const railNotes = useMemo(() => {
    const byNewest = (a: StudyNote, b: StudyNote) => b.createdAt.localeCompare(a.createdAt)
    const pinned = courseNotes.filter((n) => n.pinned).sort(byNewest)
    const recent = courseNotes.filter((n) => !n.pinned).sort(byNewest).slice(0, 5)
    return [...pinned, ...recent]
  }, [courseNotes])

  const openAssignments = useMemo(
    () => assignments.filter((a) => course && a.courseId === course.id && !a.done),
    [assignments, course],
  )
  const nextDeadline = useMemo(() => {
    const today = getToday()
    return openAssignments
      .filter((a) => a.deadline && a.deadline >= today)
      .sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0]
  }, [openAssignments])

  // ── Byte plumbing ──

  const loadIntoCache = useCallback((f: MaterialFile) => {
    if (cache[f.mediaId]) return
    void loadFile(f.mediaId, f.mime).then((data) => {
      if (data) setCache((cur) => (cur[f.mediaId] ? cur : { ...cur, [f.mediaId]: data }))
    })
  }, [cache])

  const addFiles = useCallback(async (files: File[]) => {
    if (!course) return
    const cap = maxUploadBytes()
    const problems: string[] = []
    setBusy(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        if (f.size > cap) { problems.push(`“${f.name}” is over ${formatBytes(cap)} — skipped`); continue }
        try {
          const dataUrl = await fileToDataUrl(f)
          const id = matId()
          // Sanitize the extension so the id satisfies the media backend's
          // /^[A-Za-z0-9._-]{1,200}$/ contract (matches the MCP tool's scheme).
          const ext = extFor(f.name, f.type).replace(/[^a-z0-9]/g, '') || 'bin'
          const mediaId = `${id}-${Date.now()}-${i}.${ext}`
          const ok = await saveFile(mediaId, dataUrl)
          if (!ok) throw new Error('save failed')
          setCache((prev) => ({ ...prev, [mediaId]: dataUrl }))
          const material: ClassMaterial = {
            id,
            courseId: course.id,
            kind: 'file',
            name: f.name || mediaId,
            ...(unitFilterLabel ? { unit: unitFilterLabel } : {}),
            tags: [],
            file: { mediaId, name: f.name || mediaId, mime: f.type || 'application/octet-stream', size: f.size },
            addedAt: new Date().toISOString(),
            source: 'app',
          }
          updateMaterials((prev) => [material, ...prev])
        } catch { problems.push(`“${f.name}” couldn't be saved — try again`) }
      }
    } finally { setBusy(false) }
    setError(problems.length ? problems.join(' · ') : null)
  }, [course, unitFilterLabel, updateMaterials])

  const addDroppedLink = useCallback((url: string, title: string) => {
    if (!course) return
    const material: ClassMaterial = {
      id: matId(),
      courseId: course.id,
      kind: 'link',
      name: title || linkName(url),
      ...(unitFilterLabel ? { unit: unitFilterLabel } : {}),
      tags: [],
      url,
      addedAt: new Date().toISOString(),
      source: 'app',
    }
    updateMaterials((prev) => [material, ...prev])
  }, [course, unitFilterLabel, updateMaterials])

  // Drop router — files become file materials, dragged links become link materials.
  const handleDrop = useCallback((dt: DataTransfer) => {
    const files = Array.from(dt.files)
    if (files.length) { void addFiles(files); return }
    const link = readDraggedLink(dt)
    if (link) addDroppedLink(link.url, link.title)
  }, [addFiles, addDroppedLink])

  // Panel-level drag tracking (enter/leave counter avoids child-flicker)
  const onDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).some(t => t === 'Files' || t === 'text/uri-list' || t === 'text/plain')) return
    e.preventDefault(); dragDepth.current++; setPageDrag(true)
  }
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  const onDragLeave = () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setPageDrag(false) }
  const resetDrag = () => { dragDepth.current = 0; setPageDrag(false) }

  // ── CRUD ──

  const openCreate = (kind: 'link' | 'text') =>
    setEditor({ id: null, kind, name: '', unit: unitFilterLabel, description: '', tags: '', url: '', text: '' })

  const openEdit = (m: ClassMaterial) =>
    setEditor({
      id: m.id, kind: m.kind, name: m.name, unit: m.unit ?? '', description: m.description ?? '',
      tags: m.tags.join(', '), url: m.url ?? '', text: m.text ?? '', file: m.file,
    })

  const editorValid = !editor ? false
    : editor.kind === 'link' ? /^https?:\/\//i.test(editor.url.trim())
    : editor.kind === 'text' ? editor.text.trim().length > 0
    : true

  const commitEditor = () => {
    const ed = editor
    if (!ed || !editorValid) return
    const name = ed.name.trim() || (ed.kind === 'link' ? linkName(ed.url.trim()) : ed.kind === 'text' ? textName(ed.text) : ed.file?.name ?? 'Untitled')
    const unit = ed.unit.trim()
    const description = ed.description.trim()
    const patch = {
      name,
      unit: unit || undefined,
      description: description || undefined,
      tags: parseTags(ed.tags),
      ...(ed.kind === 'link' ? { url: ed.url.trim() } : {}),
      ...(ed.kind === 'text' ? { text: ed.text } : {}),
    }
    if (ed.id) {
      updateMaterials((prev) => prev.map((m) => (m.id === ed.id ? { ...m, ...patch } : m)))
    } else if (course) {
      const material: ClassMaterial = {
        id: matId(), courseId: course.id, kind: ed.kind,
        addedAt: new Date().toISOString(), source: 'app',
        ...patch,
      }
      updateMaterials((prev) => [material, ...prev])
    }
    setEditor(null)
  }

  // Remove the store record first, then best-effort delete the stored bytes.
  const deleteMaterial = (m: ClassMaterial) => {
    updateMaterials((prev) => prev.filter((x) => x.id !== m.id))
    if (m.file) void deleteFile(m.file.mediaId)
  }

  const openMaterial = (m: ClassMaterial) => {
    if (m.kind === 'link') { if (m.url) window.open(m.url, '_blank', 'noopener,noreferrer'); return }
    if (m.kind === 'text') { openEdit(m); return }
    const f = m.file
    if (!f) return
    loadIntoCache(f)
    if (isImageFile(f)) setLightbox(m)
    else if (isPdfFile(f)) setPdfView(m)
    else {
      // Other binaries: download via a data-URL anchor once the bytes arrive.
      void (async () => {
        const src = cache[f.mediaId] ?? await loadFile(f.mediaId, f.mime)
        if (!src) return
        const a = document.createElement('a'); a.href = src; a.download = f.name; a.click()
      })()
    }
  }

  const addQuickNote = () => {
    const text = quickNote.trim()
    if (!text || !course) return
    const note: StudyNote = {
      id: noteId(), courseId: course.id, courseName: course.name,
      text, tags: [], pinned: false, source: 'manual', createdAt: new Date().toISOString(),
    }
    updateNotes((prev) => [note, ...prev])
    setQuickNote('')
  }

  const selectCourse = (id: string) => {
    setSelectedId(id)
    setUnitFilter(null)
    setError(null)
  }

  // ── Render ──

  if (railCourses.length === 0) {
    return (
      <PageShell>
        <EmptyState message="No courses to file under." hint="Add your courses in the Overview tab first." />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        {/* Course rail — vertical on xl, horizontal scroll below */}
        <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
          {railCourses.map((c) => {
            const Icon = ICONS[c.iconKey] ?? GraduationCap
            const sel = course?.id === c.id
            return (
              /* Selectable course card — documented compact pattern (card-shaped
                 toggle). Selection is the ONE accent; identity stays neutral. */
              <button
                key={c.id}
                onClick={() => selectCourse(c.id)}
                aria-pressed={sel}
                className={cn(
                  'flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  sel ? 'border-accent/40 bg-accent/5' : 'border-border hover:border-input hover:bg-muted/30',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', sel ? 'text-accent' : 'text-muted-foreground')} />
                <span className="min-w-0 max-w-40 flex-1 truncate text-xs font-medium xl:max-w-none">{c.name}</span>
                <span className="font-mono text-2xs tabular-nums text-muted-foreground">{countByCourse[c.id] || 0}</span>
              </button>
            )
          })}
        </div>

        {/* Per-course dossier — the whole panel is a drop target */}
        {course && (
          <div
            className={cn(
              'relative flex min-w-0 flex-col gap-6 rounded-xl transition-all',
              pageDrag && 'ring-2 ring-accent/40 ring-offset-4 ring-offset-background',
            )}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={(e) => { e.preventDefault(); resetDrag(); handleDrop(e.dataTransfer) }}
          >
            <PageHeader
              kicker={course.semester}
              title={course.name}
              subtitle={`${courseMaterials.length} ${courseMaterials.length === 1 ? 'material' : 'materials'} · ${namedUnits.length} ${namedUnits.length === 1 ? 'unit' : 'units'}`}
              actions={
                <>
                  <label className={cn(buttonVariants({ variant: 'default', size: 'sm' }), busy ? 'cursor-wait motion-safe:animate-pulse' : 'cursor-pointer')}>
                    <Upload /> {busy ? 'Uploading…' : 'Upload files'}
                    <input type="file" multiple className="hidden" disabled={busy} onChange={(e) => {
                      const files = e.target.files ? Array.from(e.target.files) : []
                      if (files.length) void addFiles(files)
                      e.target.value = ''
                    }} />
                  </label>
                  <Button variant="secondary" size="sm" onClick={() => openCreate('link')}><Link2 /> Add link</Button>
                  <Button variant="secondary" size="sm" onClick={() => openCreate('text')}><StickyNote /> Add text</Button>
                </>
              }
            />

            {error && <p className="text-xs text-destructive">{error}</p>}

            {/* Stat strip */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Materials" value={courseMaterials.length} icon={<Layers />} sub={`${namedUnits.length} ${namedUnits.length === 1 ? 'unit' : 'units'}`} />
              <StatTile
                label="Next deadline"
                value={nextDeadline ? `${daysUntil(nextDeadline.deadline!)}d` : '—'}
                icon={<CalendarDays />}
                sub={nextDeadline ? `${nextDeadline.name} · ${fmtDate(nextDeadline.deadline!)}` : 'No dated work'}
              />
              <StatTile label="Open work" value={openAssignments.length} icon={<ClipboardList />} sub={openAssignments.length === 1 ? 'assignment pending' : 'assignments pending'} />
              <StatTile label="Notes" value={courseNotes.length} icon={<Pin />} sub={`${courseNotes.filter((n) => n.pinned).length} pinned`} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              {/* Materials, grouped by unit */}
              <div className="flex min-w-0 flex-col gap-4">
                {unitGroups.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip selectable selected={effectiveFilter === null} onClick={() => setUnitFilter(null)}>All</Chip>
                    {unitGroups.map((g) => (
                      <Chip key={g.key || 'general'} selectable selected={effectiveFilter === g.key} onClick={() => setUnitFilter(effectiveFilter === g.key ? null : g.key)}>
                        {g.label} ({g.items.length})
                      </Chip>
                    ))}
                  </div>
                )}

                {courseMaterials.length === 0 ? (
                  <EmptyState
                    message={`Nothing filed for ${course.name} yet.`}
                    hint="Drop a PDF anywhere on this panel."
                  />
                ) : (
                  <div className="flex flex-col gap-5">
                    {visibleGroups.map((g) => (
                      <section key={g.key || 'general'}>
                        <h3 className="mb-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                          {g.label} <span className="tabular-nums text-foreground-faint">· {g.items.length}</span>
                        </h3>
                        <div className="surface rounded-xl">
                          <div className="flex flex-col divide-y divide-border/60">
                            {g.items.map((m) => (
                              <MaterialRow
                                key={m.id}
                                material={m}
                                onOpen={() => openMaterial(m)}
                                onEdit={() => openEdit(m)}
                                onDelete={() => deleteMaterial(m)}
                              />
                            ))}
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes rail — course-scoped pinned + recent */}
              <WidgetCard
                title="Study notes"
                description={`${courseNotes.length} for this course · pinned first`}
                delay={0.15}
                className="h-fit"
              >
                <div className="flex flex-col gap-2">
                  <Input
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addQuickNote() }}
                    placeholder="Quick note… Enter saves"
                    className="h-8 text-xs"
                  />
                  {railNotes.length === 0 ? (
                    <EmptyState message="Nothing noted here yet." hint="Notes you or Claude save land here." className="py-6" />
                  ) : (
                    railNotes.map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          'relative rounded-md px-3 py-2 transition-colors hover:bg-secondary/30',
                          n.pinned && 'pl-3.5 before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent',
                        )}
                      >
                        <p className="line-clamp-3 text-xs leading-relaxed">{n.text}</p>
                        <p className="mt-1 font-mono text-2xs text-foreground-faint">
                          {fmtDate(localDate(new Date(n.createdAt)))} · via {n.source}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </WidgetCard>
            </div>

            {/* Drag-over overlay */}
            {pageDrag && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border border-accent/40 bg-accent/5">
                <p className="font-serif italic text-lg text-muted-foreground">Drop to file under {course.name}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add / edit modal */}
      <Modal
        open={!!editor}
        onOpenChange={(o) => { if (!o) setEditor(null) }}
        size="sm"
        title={editor?.id ? 'Edit material' : editor?.kind === 'link' ? 'Add link' : 'Add text'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)}>Cancel</Button>
            <Button onClick={commitEditor} disabled={!editorValid}>Save</Button>
          </>
        }
      >
        {editor && (
          <div className="flex flex-col gap-3">
            {editor.kind === 'link' && (
              <div>
                <label className="mb-1 block text-2xs text-muted-foreground">URL</label>
                <Input value={editor.url} onChange={(e) => setEditor({ ...editor, url: e.target.value })} placeholder="https://…" className="h-8 font-mono text-xs" />
              </div>
            )}
            {editor.kind === 'text' && (
              <div>
                <label className="mb-1 block text-2xs text-muted-foreground">Text</label>
                <textarea
                  value={editor.text}
                  onChange={(e) => setEditor({ ...editor, text: e.target.value })}
                  rows={5}
                  placeholder="Formulas, prof constraints, anything worth keeping…"
                  className="w-full resize-y rounded-md border border-input bg-input/20 px-3 py-2 text-xs leading-relaxed outline-none placeholder:text-foreground-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
              </div>
            )}
            {editor.file && (
              <p className="font-mono text-2xs text-foreground-faint">
                {editor.file.name} · {formatBytes(editor.file.size)}
              </p>
            )}
            <div>
              <label className="mb-1 block text-2xs text-muted-foreground">Name</label>
              <Input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="Display name (auto if empty)" className="h-8 text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-2xs text-muted-foreground">Unit</label>
              <Input list="material-unit-options" value={editor.unit} onChange={(e) => setEditor({ ...editor, unit: e.target.value })} placeholder="Unidad 1, Contenidos generales…" className="h-8 text-xs" />
              <datalist id="material-unit-options">
                {namedUnits.map((u) => <option key={u} value={u} />)}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-2xs text-muted-foreground">Description</label>
              <Input value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} placeholder="What is this?" className="h-8 text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-2xs text-muted-foreground">Tags</label>
              <Input value={editor.tags} onChange={(e) => setEditor({ ...editor, tags: e.target.value })} placeholder="comma, separated" className="h-8 text-xs" />
            </div>
          </div>
        )}
      </Modal>

      {/* Image lightbox */}
      {lightbox?.file && (
        <Modal
          open
          onOpenChange={(o) => { if (!o) setLightbox(null) }}
          size="full"
          className="grid-rows-[minmax(0,1fr)]"
        >
          <div className="flex h-full min-h-0 items-center justify-center">
            {cache[lightbox.file.mediaId]
              ? <img src={cache[lightbox.file.mediaId]} alt={lightbox.name} className="max-h-full max-w-full rounded-md object-contain" />
              : <Skeleton className="h-2/3 w-2/3" />}
          </div>
        </Modal>
      )}

      {/* PDF viewer */}
      {pdfView?.file && (
        <Modal
          open
          onOpenChange={(o) => { if (!o) setPdfView(null) }}
          size="full"
          className="grid-rows-[minmax(0,1fr)]"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3 pr-8">
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{pdfView.file.name}</span>
              {cache[pdfView.file.mediaId] && (
                <a href={cache[pdfView.file.mediaId]} download={pdfView.file.name} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                  <Download /> Save
                </a>
              )}
            </div>
            <div className="min-h-0 flex-1 pt-3">
              {cache[pdfView.file.mediaId]
                ? <iframe src={cache[pdfView.file.mediaId]} title={pdfView.file.name} className="h-full w-full border-0" />
                : (
                  <div className="flex h-full flex-col gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="min-h-0 w-full flex-1" />
                  </div>
                )}
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  )
}

// ── Material row ─────────────────────────────────────────────────────────────

function MaterialRow({ material: m, onOpen, onEdit, onDelete }: {
  material: ClassMaterial
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const Glyph = kindGlyph(m)
  const OpenGlyph = m.kind === 'link' ? ExternalLink : Eye
  const revealCls = 'opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100'
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/30">
      <Glyph className="h-4 w-4 shrink-0 text-foreground-faint" />
      {/* Click-to-open name — documented compact pattern (bare text trigger in a dense row). */}
      <button onClick={onOpen} title={`Open ${m.name}`} className="min-w-0 flex-1 cursor-pointer text-left">
        <p className="truncate text-sm font-medium">{m.name}</p>
        {m.description && <p className="truncate text-2xs text-foreground-faint">{m.description}</p>}
      </button>
      {m.tags.slice(0, 3).map((t) => (
        <Chip key={t} size="sm" className="hidden sm:inline-flex">{t}</Chip>
      ))}
      <span className="hidden shrink-0 font-mono text-2xs tabular-nums text-muted-foreground sm:inline">
        {m.file ? formatBytes(m.file.size) : m.kind}
      </span>
      <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">{fmtDate(localDate(new Date(m.addedAt)))}</span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon-xs" onClick={onOpen} aria-label={`Open ${m.name}`} className={revealCls}>
          <OpenGlyph />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label={`Edit ${m.name}`} className={revealCls}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label={`Delete ${m.name}`} className={cn(revealCls, 'hover:text-destructive')}>
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
