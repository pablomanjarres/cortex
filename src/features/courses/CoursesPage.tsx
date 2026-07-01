import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { NotesField } from '@/components/shared/NotesField'
import { Input } from '@/components/ui/input'
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

// ── Category styling ─────────────────────────────────────────────────────────

const CATEGORIES: Category[] = ['course', 'pdf', 'note', 'reference', 'link', 'other']

const catLabel: Record<Category, string> = {
  course: 'Course', pdf: 'PDF', note: 'Note', reference: 'Reference', link: 'Link', other: 'Other',
}

const catColor: Record<Category, string> = {
  course: 'bg-indigo-500/15 text-indigo-300',
  pdf: 'bg-rose-500/15 text-rose-300',
  note: 'bg-amber-500/15 text-amber-300',
  reference: 'bg-emerald-500/15 text-emerald-300',
  link: 'bg-sky-500/15 text-sky-300',
  other: 'bg-zinc-500/15 text-zinc-300',
}

const catBorder: Record<Category, string> = {
  course: 'border-l-indigo-500/50',
  pdf: 'border-l-rose-500/50',
  note: 'border-l-amber-500/50',
  reference: 'border-l-emerald-500/50',
  link: 'border-l-sky-500/50',
  other: 'border-l-zinc-500/50',
}

const catIcon: Record<Category, typeof BookOpen> = {
  course: GraduationCap, pdf: FileText, note: BookOpen, reference: BookOpen, link: LinkIcon, other: Paperclip,
}

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
      <div className={cn('relative overflow-hidden bg-zinc-800/50', className)}>
        <iframe
          src={`${src}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          title={file.name}
          tabIndex={-1}
          className="absolute inset-0 w-full h-full pointer-events-none border-0 bg-white"
        />
      </div>
    )
  }
  const Icon = isPdf(file) ? FileText : Paperclip
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1 bg-zinc-800/50 text-muted-foreground/50', className)}>
      <Icon className="h-6 w-6" />
      <span className="text-[9px] uppercase">{extFor(file.name, file.mime)}</span>
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
        className={cn('relative flex flex-col gap-6 rounded-xl transition-all', pageDrag && 'ring-2 ring-indigo-400/40 ring-offset-4 ring-offset-background')}
        onDragEnter={onPageDragEnter}
        onDragOver={onPageDragOver}
        onDragLeave={onPageDragLeave}
        onDrop={e => { e.preventDefault(); resetDrag(); handleDrop(e.dataTransfer) }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Courses</h1>
            <p className="text-xs text-muted-foreground">
              {items.length} <span className="text-indigo-400/70">items</span> · drag a PDF, image or article here
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
              <Upload className="h-3.5 w-3.5" /> PDF
              <input type="file" accept="application/pdf" multiple className="hidden" onChange={e => {
                const files = e.target.files ? Array.from(e.target.files) : []
                if (files.length) addItemWithFiles(files)
                e.target.value = ''
              }} />
            </label>
            <button onClick={() => addItem()} className="cursor-pointer flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/90 text-white hover:bg-indigo-500 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setFilterCat(null)} className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${!filterCat ? 'bg-foreground/10 text-foreground border-foreground/20' : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>All</button>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setFilterCat(filterCat === c ? null : c)} className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${filterCat === c ? `${catColor[c]} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}>
                {catLabel[c]} {counts[c] ? `(${counts[c]})` : ''}
              </button>
            ))}
          </div>
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input placeholder="Search courses, notes, subjects…" value={search} onChange={e => setSearch(e.target.value)} className="h-7 pl-8 text-xs" />
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <WidgetCard title="Nothing here yet" description="Drag a PDF or an article in, or click Add" delay={0.1}>
            <div className="flex flex-col items-center gap-3 py-10">
              <GraduationCap className="h-10 w-10 text-indigo-400/20" />
              <p className="text-xs text-muted-foreground/50">Drop files or links anywhere on this page to file them</p>
            </div>
          </WidgetCard>
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
                    'liquid-glass rounded-xl border border-border border-l-2 overflow-hidden transition-all',
                    catBorder[it.category],
                    isExp ? 'sm:col-span-2 lg:col-span-3' : 'cursor-pointer hover:border-foreground/20',
                    isDropTarget && 'ring-2 ring-indigo-400/70',
                  )}
                  onClick={() => !isExp && setExpanded(it.id)}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; setDragCard(it.id) }}
                  onDragLeave={e => { e.stopPropagation(); setDragCard(cur => cur === it.id ? null : cur) }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); resetDrag(); handleDrop(e.dataTransfer, it.id) }}
                >
                  {/* Cover preview */}
                  {!isExp && cover && (
                    <div className="relative bg-zinc-800/40 border-b border-border/60" onClick={e => { e.stopPropagation(); setExpanded(it.id) }}>
                      <FilePreview file={cover} src={cache[cover.id]} className="h-[150px] w-full" />
                      {isDropTarget && <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center text-xs text-white font-medium">Drop to attach</div>}
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
                          <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/50" />
                          <p className="text-sm font-medium leading-snug line-clamp-2">
                            {it.title || <span className="text-muted-foreground/40 italic">Untitled</span>}
                          </p>
                        </div>
                        {it.content && <p className="text-xs text-muted-foreground/70 line-clamp-2 mt-1.5 leading-relaxed">{it.content.replace(/[#>*`_]/g, '')}</p>}
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full ${catColor[it.category]}`}>{catLabel[it.category]}</span>
                          {it.subject && <span className="text-[9px] px-2 py-0.5 rounded-full bg-foreground/[0.06] text-muted-foreground/70">{it.subject}</span>}
                          {docs.length > 0 && <span className="text-[9px] text-rose-300/60 flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" /> {docs.length}</span>}
                          {images.length > 0 && <span className="text-[9px] text-indigo-300/60 flex items-center gap-0.5"><ImageIcon className="h-2.5 w-2.5" /> {images.length}</span>}
                          <span className="text-[10px] text-muted-foreground/40 ml-auto">{timeAgo(it.createdAt)}</span>
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
          <div className="pointer-events-none fixed left-1/2 -translate-x-1/2 bottom-8 z-[60] flex items-center gap-2 rounded-full bg-indigo-500 text-white text-xs font-medium px-4 py-2 shadow-lg">
            <Download className="h-3.5 w-3.5" /> {dragCard ? 'Drop to attach to this item' : 'Drop to file it here'}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          <button onClick={e => { e.stopPropagation(); setLightbox(null) }} className="cursor-pointer absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] text-white/70 hover:text-white z-10"><X className="h-7 w-7" /></button>
          {lightbox.ids.length > 1 && <span className="absolute left-1/2 -translate-x-1/2 top-[calc(1.25rem+env(safe-area-inset-top))] text-white/70 text-sm">{lightbox.index + 1} / {lightbox.ids.length}</span>}
          <img src={cache[lightbox.ids[lightbox.index]]} alt="" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          {lightbox.ids.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); setLightbox(p => p ? { ...p, index: (p.index - 1 + p.ids.length) % p.ids.length } : null) }} className="cursor-pointer absolute left-2 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-2"><ChevronLeft className="h-6 w-6" /></button>
              <button onClick={e => { e.stopPropagation(); setLightbox(p => p ? { ...p, index: (p.index + 1) % p.ids.length } : null) }} className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-2"><ChevronRight className="h-6 w-6" /></button>
            </>
          )}
        </div>,
        document.body,
      )}

      {/* PDF viewer */}
      {pdfView && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-background/95 backdrop-blur-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center justify-between px-4 md:pl-20 py-3 border-b border-border">
            <button onClick={() => setPdfView(null)} className="cursor-pointer flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" /> Close
            </button>
            <span className="text-xs text-muted-foreground/70 truncate max-w-[50%]">{pdfView.name}</span>
            <a href={cache[pdfView.id]} download={pdfView.name} className="cursor-pointer flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Download className="h-4 w-4" /> Save
            </a>
          </div>
          <div className="flex-1 bg-zinc-900/40">
            {cache[pdfView.id]
              ? <iframe src={cache[pdfView.id]} title={pdfView.name} className="w-full h-full border-0" />
              : <div className="flex items-center justify-center h-full text-sm text-muted-foreground/50">Loading…</div>}
          </div>
        </div>,
        document.body,
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
          <button onClick={onCollapse} className="cursor-pointer text-muted-foreground/40 hover:text-foreground transition-colors" title="Collapse"><Minus className="h-3.5 w-3.5" /></button>
          <span className={`text-[9px] px-2 py-0.5 rounded-full ${catColor[item.category]}`}>{catLabel[item.category]}</span>
          <span className="text-[10px] text-muted-foreground/50">{timeAgo(item.updatedAt || item.createdAt)}</span>
        </div>
        <button onClick={onDelete} className="cursor-pointer text-muted-foreground/40 hover:text-red-400 transition-colors" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      {/* Title */}
      <Input value={item.title} onChange={e => onField({ title: e.target.value })} placeholder="Title" className="h-10 text-base font-semibold" />

      {/* Meta row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">Category</label>
          <select value={item.category} onChange={e => onField({ category: e.target.value as Category })} className="w-full h-8 rounded-md border border-border bg-input px-2 text-xs outline-none">
            {CATEGORIES.map(c => <option key={c} value={c}>{catLabel[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">Subject</label>
          <Input value={item.subject} onChange={e => onField({ subject: e.target.value })} placeholder="e.g. Formal Languages" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block">Link</label>
          <div className="relative">
            <LinkIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
            <Input value={item.url} onChange={e => onField({ url: e.target.value })} placeholder="https://…" className="h-8 pl-7 text-xs" />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-[10px] text-muted-foreground mb-1 block">Notes</label>
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
          <label className="text-[10px] text-muted-foreground mb-1.5 block">Files</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {item.files.map(f => (
              <div key={f.id} className="group relative rounded-lg border border-border overflow-hidden bg-input/40">
                <button onClick={() => openFile(f)} className="cursor-pointer block w-full" title={`Open ${f.name}`}>
                  <FilePreview file={f} src={cache[f.id]} className="h-28 w-full" />
                </button>
                <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-border/60">
                  {isPdf(f) ? <FileText className="h-3 w-3 shrink-0 text-rose-300/70" /> : isImage(f) ? <ImageIcon className="h-3 w-3 shrink-0 text-indigo-300/70" /> : <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
                  <span className="text-[10px] truncate flex-1" title={f.name}>{f.name}</span>
                  {f.size > 0 && <span className="text-[9px] text-muted-foreground/40 shrink-0">{formatBytes(f.size)}</span>}
                </div>
                {cache[f.id] && (
                  <a href={cache[f.id]} download={f.name} onClick={e => e.stopPropagation()} className="cursor-pointer absolute top-1 left-1 bg-background/70 rounded p-1 text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity" title="Download"><Download className="h-3 w-3" /></a>
                )}
                <button onClick={() => onRemoveFile(f.id)} className="cursor-pointer absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove"><X className="h-2.5 w-2.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add files */}
      <label className={`flex items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-xs transition-all ${busy ? 'border-indigo-500/40 text-indigo-300/70 animate-pulse cursor-wait' : 'cursor-pointer border-indigo-500/20 text-muted-foreground/50 hover:border-indigo-500/40 hover:text-indigo-300/70'}`}>
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
