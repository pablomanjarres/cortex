import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/shared/Skeleton'
import { Modal } from '@/components/shared/Modal'
import { NotesField } from '@/components/shared/NotesField'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'
import { timeAgo } from '@/lib/date-utils'
import { saveFile, loadFile, deleteFile, fileToDataUrl, formatBytes, extFor } from '@/lib/media'
import {
  Search, Plus, Trash2, X, Link as LinkIcon, GraduationCap, FileText, Download,
  Upload, Image as ImageIcon, ChevronLeft, ChevronRight, Minus, Paperclip, BookOpen,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type Category = 'course' | 'pdf' | 'note' | 'reference' | 'link' | 'other'

interface StoredFile {
  id: string       // media id, e.g. "crs-123-0.pdf"
  name: string     // original filename
  mime: string
  size: number
}

interface CourseItem {
  id: string
  title: string
  category: Category
  subject: string
  content: string
  url: string
  files: StoredFile[]
  createdAt: string
  updatedAt?: string
}

// ── Categories (labels + icons — categories are text, never per-item hues) ───

const CATEGORIES: Category[] = ['course', 'pdf', 'note', 'reference', 'link', 'other']

const catLabel: Record<Category, string> = {
  course: 'Course', pdf: 'PDF', note: 'Note', reference: 'Reference', link: 'Link', other: 'Other',
}

const catIcon: Record<Category, typeof BookOpen> = {
  course: GraduationCap, pdf: FileText, note: BookOpen, reference: BookOpen, link: LinkIcon, other: Paperclip,
}

// Shared token style for native <select> controls (mirrors the Input primitive;
// the global :focus-visible rule supplies the focus ring).
const selectCls =
  'cursor-pointer rounded-md border border-input bg-input/20 text-foreground transition-colors duration-150 outline-none'

// ── File helpers ─────────────────────────────────────────────────────────────

const isImage = (f: StoredFile) => f.mime.startsWith('image/')
const isPdf = (f: StoredFile) => f.mime === 'application/pdf'

function inferCategory(files: StoredFile[]): Category {
  if (files.some(isPdf)) return 'pdf'
  if (files.some(isImage)) return 'note'
  return 'other'
}

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

// ── File preview (renders the actual file, not just an icon) ──────────────────

function FilePreview({ file, src, className }: { file: StoredFile; src?: string | null; className?: string }) {
  if (src && isImage(file)) {
    return <img src={src} alt={file.name} className={cn('object-cover', className)} />
  }
  if (src && isPdf(file)) {
    // Chromium (Electron) renders PDFs natively; show the first page as a
    // non-interactive thumbnail. Click handling lives on the parent.
    return (
      <div className={cn('relative overflow-hidden bg-muted/40', className)}>
        <iframe
          src={`${src}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          title={file.name}
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-white"
        />
      </div>
    )
  }
  const Icon = isPdf(file) ? FileText : Paperclip
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1 bg-muted/40 text-foreground-faint', className)}>
      <Icon className="h-6 w-6" />
      <span className="font-mono text-3xs uppercase">{extFor(file.name, file.mime)}</span>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function CoursesPage() {
  const [items, updateItems] = useStore<CourseItem[]>('cortex-courses', [])
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<Category | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [cache, setCache] = useState<Record<string, string>>({}) // media id -> data URL
  const [pageDrag, setPageDrag] = useState(false)
  const [dragCard, setDragCard] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ ids: string[]; index: number } | null>(null)
  const [pdfView, setPdfView] = useState<StoredFile | null>(null)
  const dragDepth = useRef(0)

  // Load bytes for every referenced file.
  useEffect(() => {
    const wanted = items.flatMap(it => it.files.map(f => [f.id, f.mime] as const)).filter(([id]) => id && !cache[id])
    if (!wanted.length) return
    Promise.all(wanted.map(async ([id, mime]) => [id, await loadFile(id, mime)] as const)).then(results => {
      const next: Record<string, string> = {}
      for (const [id, data] of results) if (data) next[id] = data
      if (Object.keys(next).length) setCache(prev => ({ ...prev, ...next }))
    })
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lightbox keyboard nav
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowLeft') setLightbox(p => p ? { ...p, index: (p.index - 1 + p.ids.length) % p.ids.length } : null)
      if (e.key === 'ArrowRight') setLightbox(p => p ? { ...p, index: (p.index + 1) % p.ids.length } : null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox])

  const setField = (id: string, patch: Partial<CourseItem>) =>
    updateItems(prev => prev.map(it => it.id === id ? { ...it, ...patch, updatedAt: new Date().toISOString() } : it))

  const addItem = useCallback((files: StoredFile[] = []) => {
    const id = `crs-${Date.now()}`
    const item: CourseItem = {
      id, title: '', category: files.length ? inferCategory(files) : 'course',
      subject: '', content: '', url: '', files, createdAt: new Date().toISOString(),
    }
    updateItems(prev => [item, ...prev])
    setExpanded(id)
  }, [updateItems])

  const persistFiles = useCallback(async (itemId: string, fileList: File[]): Promise<StoredFile[]> => {
    const stored: StoredFile[] = []
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i]
      const dataUrl = await fileToDataUrl(f)
      const mediaId = `${itemId}-${Date.now()}-${i}.${extFor(f.name, f.type)}`
      const ok = await saveFile(mediaId, dataUrl)
      if (!ok) throw new Error('save failed')
      setCache(prev => ({ ...prev, [mediaId]: dataUrl }))
      stored.push({ id: mediaId, name: f.name || mediaId, mime: f.type || 'application/octet-stream', size: f.size })
    }
    return stored
  }, [])

  // Add files to an existing item
  const addFiles = useCallback(async (itemId: string, fileList: File[]) => {
    if (!fileList.length) return
    setBusy(itemId)
    try {
      const stored = await persistFiles(itemId, fileList)
      updateItems(prev => prev.map(it => it.id === itemId ? { ...it, files: [...it.files, ...stored], updatedAt: new Date().toISOString() } : it))
    } catch { /* ignore */ } finally { setBusy(null) }
  }, [persistFiles, updateItems])

  // New item straight from dropped/pasted files
  const addItemWithFiles = useCallback(async (fileList: File[]) => {
    const id = `crs-${Date.now()}`
    setBusy(id)
    try {
      const stored = await persistFiles(id, fileList)
      const item: CourseItem = {
        id, title: '', category: inferCategory(stored), subject: '', content: '', url: '',
        files: stored, createdAt: new Date().toISOString(),
      }
      updateItems(prev => [item, ...prev])
      setExpanded(id)
    } catch { /* ignore */ } finally { setBusy(null) }
  }, [persistFiles, updateItems])

  // New item straight from a dragged link / article
  const addLinkItem = useCallback((url: string, title: string) => {
    const id = `crs-${Date.now()}`
    const item: CourseItem = {
      id, title, category: 'link', subject: '', content: '', url, files: [], createdAt: new Date().toISOString(),
    }
    updateItems(prev => [item, ...prev])
    setExpanded(id)
  }, [updateItems])

  const removeFile = async (itemId: string, fileId: string) => {
    await deleteFile(fileId)
    setField(itemId, { files: (items.find(i => i.id === itemId)?.files || []).filter(f => f.id !== fileId) })
  }

  const deleteItem = async (id: string) => {
    const it = items.find(i => i.id === id)
    if (it) for (const f of it.files) await deleteFile(f.id)
    updateItems(prev => prev.filter(i => i.id !== id))
    if (expanded === id) setExpanded(null)
  }

  // Add images from the NotesField image picker (data URLs) → stored files
  const addInlineImages = useCallback(async (itemId: string, dataUrls: string[]): Promise<string[]> => {
    const ids: string[] = []
    for (let i = 0; i < dataUrls.length; i++) {
      const mediaId = `${itemId}-${Date.now()}-${i}.png`
      await saveFile(mediaId, dataUrls[i])
      setCache(prev => ({ ...prev, [mediaId]: dataUrls[i] }))
      ids.push(mediaId)
    }
    updateItems(prev => prev.map(it => it.id === itemId
      ? { ...it, files: [...it.files, ...ids.map(id => ({ id, name: id, mime: 'image/png', size: 0 }))], updatedAt: new Date().toISOString() }
      : it))
    return ids
  }, [updateItems])

  // Shared drop logic — drop on the page creates an item; drop on a card attaches.
  const handleDrop = useCallback((dt: DataTransfer, targetId?: string) => {
    const files = Array.from(dt.files)
    if (files.length) {
      if (targetId) addFiles(targetId, files)
      else addItemWithFiles(files)
      return
    }
    const link = readDraggedLink(dt)
    if (link) {
      if (targetId) setField(targetId, { url: link.url })
      else addLinkItem(link.url, link.title)
    }
  }, [addFiles, addItemWithFiles, addLinkItem]) // eslint-disable-line react-hooks/exhaustive-deps

  // Paste images anywhere → new item
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items || [])
        .filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean) as File[]
      if (files.length) { e.preventDefault(); addItemWithFiles(files) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [addItemWithFiles])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter(it =>
      (!filterCat || it.category === filterCat) &&
      (!q || it.title.toLowerCase().includes(q) || it.content.toLowerCase().includes(q) || it.subject.toLowerCase().includes(q))
    )
  }, [items, filterCat, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const it of items) c[it.category] = (c[it.category] || 0) + 1
    return c
  }, [items])

  // Page-level drag tracking (enter/leave counter avoids child-flicker)
  const onPageDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).some(t => t === 'Files' || t === 'text/uri-list' || t === 'text/plain')) return
    e.preventDefault(); dragDepth.current++; setPageDrag(true)
  }
  const onPageDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  const onPageDragLeave = () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setPageDrag(false) }
  const resetDrag = () => { dragDepth.current = 0; setPageDrag(false); setDragCard(null) }

  return (
    <PageShell>
      <div
        className={cn('relative flex flex-col gap-6 rounded-xl transition-all', pageDrag && 'ring-2 ring-accent/40 ring-offset-4 ring-offset-background')}
        onDragEnter={onPageDragEnter}
        onDragOver={onPageDragOver}
        onDragLeave={onPageDragLeave}
        onDrop={e => { e.preventDefault(); resetDrag(); handleDrop(e.dataTransfer) }}
      >
        {/* Section header (the topbar owns the route title) */}
        <PageHeader
          kicker="Collection"
          title="Courses"
          subtitle={`${items.length} items · drag a PDF, image or article here`}
          actions={
            <>
              <label className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'cursor-pointer')}>
                <Upload /> PDF
                <input type="file" accept="application/pdf" multiple className="hidden" onChange={e => {
                  const files = e.target.files ? Array.from(e.target.files) : []
                  if (files.length) addItemWithFiles(files)
                  e.target.value = ''
                }} />
              </label>
              <Button size="sm" onClick={() => addItem()}>
                <Plus /> Add
              </Button>
            </>
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip selectable selected={!filterCat} onClick={() => setFilterCat(null)}>All</Chip>
            {CATEGORIES.map(c => (
              <Chip key={c} selectable selected={filterCat === c} onClick={() => setFilterCat(filterCat === c ? null : c)}>
                {catLabel[c]}{counts[c] ? ` (${counts[c]})` : ''}
              </Chip>
            ))}
          </div>
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-faint" />
            <Input placeholder="Search courses, notes, subjects…" value={search} onChange={e => setSearch(e.target.value)} className="h-7 pl-8 text-xs" />
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <EmptyState
            message="Nothing filed here yet."
            hint="Drop a PDF, image or article anywhere on this page — or click Add."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(it => {
              const isExp = expanded === it.id
              const images = it.files.filter(isImage)
              const docs = it.files.filter(f => !isImage(f))
              const cover = images[0] || docs[0] // preview: first image, else first doc (pdf)
              const Icon = catIcon[it.category]
              const isDropTarget = dragCard === it.id

              return (
                <div
                  key={it.id}
                  className={cn(
                    'overflow-hidden rounded-xl border border-border bg-card shadow-card transition-all',
                    isExp ? 'sm:col-span-2 lg:col-span-3' : 'cursor-pointer hover:border-input',
                    isDropTarget && 'ring-2 ring-accent/50',
                  )}
                  onClick={() => !isExp && setExpanded(it.id)}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; setDragCard(it.id) }}
                  onDragLeave={e => { e.stopPropagation(); setDragCard(cur => cur === it.id ? null : cur) }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); resetDrag(); handleDrop(e.dataTransfer, it.id) }}
                >
                  {/* Cover preview */}
                  {!isExp && cover && (
                    <div className="relative border-b border-border/60 bg-muted/40" onClick={e => { e.stopPropagation(); setExpanded(it.id) }}>
                      <FilePreview file={cover} src={cache[cover.id]} className="h-[150px] w-full" />
                      {isDropTarget && <div className="absolute inset-0 flex items-center justify-center bg-background/70 font-mono text-2xs text-accent">Drop to attach</div>}
                    </div>
                  )}

                  <div className="p-4">
                    {isExp ? (
                      <ExpandedItem
                        item={it}
                        images={images}
                        cache={cache}
                        busy={busy === it.id}
                        onCollapse={() => setExpanded(null)}
                        onField={patch => setField(it.id, patch)}
                        onDelete={() => deleteItem(it.id)}
                        onAddFiles={files => addFiles(it.id, files)}
                        onRemoveFile={fid => removeFile(it.id, fid)}
                        onAddInlineImages={urls => addInlineImages(it.id, urls)}
                        onOpenImage={(idx) => setLightbox({ ids: images.map(i => i.id), index: idx })}
                        onOpenPdf={setPdfView}
                      />
                    ) : (
                      <>
                        <div className="flex items-start gap-2">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground-faint" />
                          <p className="line-clamp-2 text-sm font-medium leading-snug">
                            {it.title || <span className="italic text-foreground-faint">Untitled</span>}
                          </p>
                        </div>
                        {it.content && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{it.content.replace(/[#>*`_]/g, '')}</p>}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Chip size="sm">{catLabel[it.category]}</Chip>
                          {it.subject && <Chip size="sm">{it.subject}</Chip>}
                          {docs.length > 0 && <span className="flex items-center gap-0.5 font-mono text-3xs tabular-nums text-foreground-faint"><FileText className="h-2.5 w-2.5" /> {docs.length}</span>}
                          {images.length > 0 && <span className="flex items-center gap-0.5 font-mono text-3xs tabular-nums text-foreground-faint"><ImageIcon className="h-2.5 w-2.5" /> {images.length}</span>}
                          <span className="ml-auto font-mono text-2xs text-foreground-faint">{timeAgo(it.createdAt)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Drop hint pill */}
        {pageDrag && (
          <div className="pointer-events-none fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lift">
            <Download className="h-3.5 w-3.5" /> {dragCard ? 'Drop to attach to this item' : 'Drop to file it here'}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <Modal
          open
          onOpenChange={o => { if (!o) setLightbox(null) }}
          size="full"
          className="grid-rows-[minmax(0,1fr)]"
        >
          <div className="relative flex h-full min-h-0 items-center justify-center">
            {lightbox.ids.length > 1 && (
              <span className="absolute left-1/2 top-1 -translate-x-1/2 font-mono text-2xs tabular-nums text-muted-foreground">
                {lightbox.index + 1} / {lightbox.ids.length}
              </span>
            )}
            <img src={cache[lightbox.ids[lightbox.index]]} alt="" className="max-h-full max-w-full rounded-md object-contain" />
            {lightbox.ids.length > 1 && (
              <>
                <Button variant="ghost" size="icon-lg" aria-label="Previous image" className="absolute left-2 top-1/2 -translate-y-1/2" onClick={() => setLightbox(p => p ? { ...p, index: (p.index - 1 + p.ids.length) % p.ids.length } : null)}>
                  <ChevronLeft className="size-5" />
                </Button>
                <Button variant="ghost" size="icon-lg" aria-label="Next image" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setLightbox(p => p ? { ...p, index: (p.index + 1) % p.ids.length } : null)}>
                  <ChevronRight className="size-5" />
                </Button>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* PDF viewer */}
      {pdfView && (
        <Modal
          open
          onOpenChange={o => { if (!o) setPdfView(null) }}
          size="full"
          className="grid-rows-[minmax(0,1fr)]"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3 pr-8">
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{pdfView.name}</span>
              {cache[pdfView.id] && (
                <a href={cache[pdfView.id]} download={pdfView.name} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                  <Download /> Save
                </a>
              )}
            </div>
            <div className="min-h-0 flex-1 pt-3">
              {cache[pdfView.id]
                ? <iframe src={cache[pdfView.id]} title={pdfView.name} className="h-full w-full border-0" />
                : (
                  <div className="flex h-full flex-col gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="min-h-0 flex-1 w-full" />
                  </div>
                )}
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  )
}

// ── Expanded item editor ─────────────────────────────────────────────────────

function ExpandedItem({
  item, images, cache, busy,
  onCollapse, onField, onDelete, onAddFiles, onRemoveFile, onAddInlineImages, onOpenImage, onOpenPdf,
}: {
  item: CourseItem
  images: StoredFile[]
  cache: Record<string, string>
  busy: boolean
  onCollapse: () => void
  onField: (patch: Partial<CourseItem>) => void
  onDelete: () => void
  onAddFiles: (files: File[]) => void
  onRemoveFile: (id: string) => void
  onAddInlineImages: (dataUrls: string[]) => Promise<string[]>
  onOpenImage: (index: number) => void
  onOpenPdf: (f: StoredFile) => void
}) {
  const openFile = (f: StoredFile) => {
    if (isImage(f)) onOpenImage(images.findIndex(i => i.id === f.id))
    else if (isPdf(f)) onOpenPdf(f)
    else if (cache[f.id]) { const a = document.createElement('a'); a.href = cache[f.id]; a.download = f.name; a.click() }
  }

  return (
    <div className="flex flex-col gap-4" onClick={e => e.stopPropagation()}>
      {/* top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-xs" onClick={onCollapse} title="Collapse" aria-label="Collapse"><Minus /></Button>
          <Chip size="sm">{catLabel[item.category]}</Chip>
          <span className="font-mono text-2xs text-foreground-faint">{timeAgo(item.updatedAt || item.createdAt)}</span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onDelete} title="Delete" aria-label="Delete" className="hover:text-destructive"><Trash2 /></Button>
      </div>

      {/* Title */}
      <Input value={item.title} onChange={e => onField({ title: e.target.value })} placeholder="Title" className="h-10 text-base font-semibold" />

      {/* Meta row */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-2xs text-muted-foreground">Category</label>
          <select value={item.category} onChange={e => onField({ category: e.target.value as Category })} className={`${selectCls} h-8 w-full px-2 text-xs`}>
            {CATEGORIES.map(c => <option key={c} value={c}>{catLabel[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-2xs text-muted-foreground">Subject</label>
          <Input value={item.subject} onChange={e => onField({ subject: e.target.value })} placeholder="e.g. Formal Languages" className="h-8 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-2xs text-muted-foreground">Link</label>
          <div className="relative">
            <LinkIcon className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-foreground-faint" />
            <Input value={item.url} onChange={e => onField({ url: e.target.value })} placeholder="https://…" className="h-8 pl-7 text-xs" />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1 block text-2xs text-muted-foreground">Notes</label>
        <NotesField
          value={item.content}
          onChange={v => onField({ content: v })}
          title={item.title}
          onChangeTitle={v => onField({ title: v })}
          images={cache}
          onAddImage={onAddInlineImages}
          placeholder="Click to write notes… (Markdown, or paste rich text)"
          minHeight={120}
        />
      </div>

      {/* File previews */}
      {item.files.length > 0 && (
        <div>
          <label className="mb-1.5 block text-2xs text-muted-foreground">Files</label>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {item.files.map(f => (
              <div key={f.id} className="group relative overflow-hidden rounded-md border border-border bg-muted/20">
                {/* Clickable file preview — documented compact pattern (tile-shaped trigger). */}
                <button onClick={() => openFile(f)} className="block w-full cursor-pointer" title={`Open ${f.name}`}>
                  <FilePreview file={f} src={cache[f.id]} className="h-28 w-full" />
                </button>
                <div className="flex items-center gap-1.5 border-t border-border/60 px-2 py-1.5">
                  {isPdf(f) ? <FileText className="h-3 w-3 shrink-0 text-foreground-faint" /> : isImage(f) ? <ImageIcon className="h-3 w-3 shrink-0 text-foreground-faint" /> : <Paperclip className="h-3 w-3 shrink-0 text-foreground-faint" />}
                  <span className="min-w-0 flex-1 truncate font-mono text-2xs" title={f.name}>{f.name}</span>
                  {f.size > 0 && <span className="shrink-0 font-mono text-3xs tabular-nums text-foreground-faint">{formatBytes(f.size)}</span>}
                </div>
                {cache[f.id] && (
                  <a
                    href={cache[f.id]}
                    download={f.name}
                    onClick={e => e.stopPropagation()}
                    title="Download"
                    aria-label={`Download ${f.name}`}
                    className={cn(buttonVariants({ variant: 'ghost', size: 'icon-xs' }), 'absolute left-1 top-1 bg-background/70 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100')}
                  >
                    <Download />
                  </a>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onRemoveFile(f.id)}
                  title="Remove"
                  aria-label={`Remove ${f.name}`}
                  className="absolute right-1 top-1 bg-background/70 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add files — hairline dashed dropzone, accent on hover */}
      <label className={cn(
        'flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-3 text-xs transition-colors',
        busy
          ? 'cursor-wait text-muted-foreground motion-safe:animate-pulse'
          : 'cursor-pointer text-muted-foreground hover:border-accent/40 hover:text-accent'
      )}>
        {busy ? 'Uploading…' : (<><Upload className="h-3.5 w-3.5" /> Add or drop a file</>)}
        <input type="file" accept="*/*" multiple className="hidden" disabled={busy} onChange={async e => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length) await onAddFiles(files)
          e.target.value = ''
        }} />
      </label>
    </div>
  )
}
