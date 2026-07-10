import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Modal } from '@/components/shared/Modal'
import { Skeleton } from '@/components/shared/Skeleton'
import { NotesField } from '@/components/shared/NotesField'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import { timeAgo } from '@/lib/date-utils'
import {
  Search,
  Plus,
  Trash2,
  Image as ImageIcon,
  Link,
  X,
  Minus,
  ClipboardPaste,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type CaptureSource = 'x' | 'tiktok' | 'linkedin' | 'reddit' | 'article' | 'screenshot' | 'other'

interface Capture {
  id: string
  title: string
  content: string
  source: CaptureSource
  url: string
  imageIds: string[]
  createdAt: string
}

/** Migrate legacy captures that had a single `imageId` string */
function migrateCapture(raw: any): Capture {
  if ('imageId' in raw && !('imageIds' in raw)) {
    const { imageId, ...rest } = raw
    return { ...rest, imageIds: imageId ? [imageId] : [] }
  }
  return raw
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SOURCES: CaptureSource[] = ['x', 'tiktok', 'linkedin', 'reddit', 'article', 'screenshot', 'other']

const sourceLabel: Record<CaptureSource, string> = {
  x: 'X', tiktok: 'TikTok', linkedin: 'LinkedIn', reddit: 'Reddit',
  article: 'Article', screenshot: 'Screenshot', other: 'Other',
}

// Shared token style for native <select> controls (mirrors the Input primitive).
const selectCls =
  'w-full h-8 cursor-pointer rounded-md border border-input bg-input/20 px-2 text-xs text-foreground transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

// ── Media helpers ────────────────────────────────────────────────────────────

async function saveImage(id: string, base64: string): Promise<boolean> {
  if (window.electronAPI?.media) {
    return window.electronAPI.media.save(id, base64)
  }
  try {
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, base64 }),
    })
    if (res.ok) return true
  } catch { /* fall through */ }
  try { localStorage.setItem(`cortex-capture-img-${id}`, base64); return true } catch { return false }
}

async function loadImage(id: string): Promise<string | null> {
  if (window.electronAPI?.media) {
    return window.electronAPI.media.load(id)
  }
  try {
    const res = await fetch(`/api/media?id=${encodeURIComponent(id)}`)
    if (res.ok) {
      const data = await res.json()
      if (data) return data
    }
  } catch { /* fall through */ }
  return localStorage.getItem(`cortex-capture-img-${id}`)
}

async function deleteImage(id: string): Promise<void> {
  if (window.electronAPI?.media) {
    await window.electronAPI.media.delete(id)
  } else {
    try {
      await fetch('/api/media/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch { /* fall through */ }
    localStorage.removeItem(`cortex-capture-img-${id}`)
  }
}

// ── Notes editing ────────────────────────────────────────────────────────────
// Notes now use the shared <NotesField>: inline quick-edit for short jots,
// with an opt-in fullscreen mode for longer writing. See components/shared.

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Component ────────────────────────────────────────────────────────────────

export function CapturesPage() {
  const [rawCaptures, updateCaptures] = useStore<Capture[]>('cortex-captures', [])

  // One-time migration: persist migrated data if any capture had old `imageId`
  useEffect(() => {
    const needsMigration = rawCaptures.some((c: any) => 'imageId' in c && !('imageIds' in c))
    if (needsMigration) {
      updateCaptures(() => rawCaptures.map(migrateCapture))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const captures = useMemo(() => rawCaptures.map(migrateCapture), [rawCaptures])
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState<CaptureSource | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [imageCache, setImageCache] = useState<Record<string, string>>({})
  const [dragOver, setDragOver] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState<Record<string, number>>({})
  const [lightbox, setLightbox] = useState<{ imageIds: string[]; index: number } | null>(null)
  const [uploading, setUploading] = useState<string | null>(null) // capture id being uploaded to
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // Auto-clear upload status after 3s
  useEffect(() => {
    if (!uploadStatus) return
    const t = setTimeout(() => setUploadStatus(null), 3000)
    return () => clearTimeout(t)
  }, [uploadStatus])

  // Lightbox keyboard navigation (Escape is handled by the Modal itself)
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setLightbox(prev => prev ? { ...prev, index: (prev.index - 1 + prev.imageIds.length) % prev.imageIds.length } : null)
      if (e.key === 'ArrowRight') setLightbox(prev => prev ? { ...prev, index: (prev.index + 1) % prev.imageIds.length } : null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lightbox])

  // Touch swipe helpers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const makeSwipeHandler = useCallback((capId: string, count: number) => (e: React.TouchEvent) => {
    if (!touchStartRef.current || count <= 1) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      setGalleryIndex(prev => {
        const cur = prev[capId] || 0
        return { ...prev, [capId]: dx < 0 ? (cur + 1) % count : (cur - 1 + count) % count }
      })
    }
    touchStartRef.current = null
  }, [])

  const onLightboxSwipe = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || !lightbox || lightbox.imageIds.length <= 1) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      setLightbox(prev => prev ? { ...prev, index: dx < 0 ? (prev.index + 1) % prev.imageIds.length : (prev.index - 1 + prev.imageIds.length) % prev.imageIds.length } : null)
    }
    touchStartRef.current = null
  }, [lightbox])

  // Load images for visible captures
  useEffect(() => {
    const allIds = captures.flatMap(c => c.imageIds)
    const toLoad = allIds.filter(id => id && !imageCache[id])
    if (toLoad.length === 0) return
    Promise.all(toLoad.map(async id => {
      const data = await loadImage(id)
      return [id, data] as const
    })).then(results => {
      const newCache: Record<string, string> = {}
      for (const [id, data] of results) {
        if (data) newCache[id] = data
      }
      if (Object.keys(newCache).length > 0) {
        setImageCache(prev => ({ ...prev, ...newCache }))
      }
    })
  }, [captures])

  const addCapture = useCallback(async (images?: string[]) => {
    const id = `cap-${Date.now()}`
    const imageIds: string[] = []
    if (images?.length) {
      for (let i = 0; i < images.length; i++) {
        const imgId = `${id}-${i}.png`
        await saveImage(imgId, images[i])
        setImageCache(prev => ({ ...prev, [imgId]: images[i] }))
        imageIds.push(imgId)
      }
    }
    const capture: Capture = {
      id,
      title: '',
      content: '',
      source: images?.length ? 'screenshot' : 'other',
      url: '',
      imageIds,
      createdAt: new Date().toISOString(),
    }
    updateCaptures(prev => [capture, ...prev])
    setExpanded(id)
  }, [updateCaptures])

  const setField = (id: string, field: Partial<Capture>) =>
    updateCaptures(prev => prev.map(c => c.id === id ? { ...c, ...field } : c))

  // Persist images inserted from within the notes editor; returns their ids so
  // NotesField can drop `![](img:id)` tags into the markdown.
  const addInlineImagesToCapture = async (id: string, base64s: string[]): Promise<string[]> => {
    const ids: string[] = []
    for (let i = 0; i < base64s.length; i++) {
      const imgId = `${id}-${Date.now()}-${i}.png`
      await saveImage(imgId, base64s[i])
      setImageCache(prev => ({ ...prev, [imgId]: base64s[i] }))
      ids.push(imgId)
    }
    updateCaptures(prev => prev.map(c => c.id === id ? { ...c, imageIds: [...c.imageIds, ...ids] } : c))
    return ids
  }

  const deleteCapture = async (id: string) => {
    const cap = captures.find(c => c.id === id)
    if (cap) {
      for (const imgId of cap.imageIds) await deleteImage(imgId)
    }
    updateCaptures(prev => prev.filter(c => c.id !== id))
    if (expanded === id) setExpanded(null)
  }

  const addImagesToCapture = async (id: string, base64s: string[]) => {
    setUploading(id)
    try {
      const newIds: string[] = []
      for (let i = 0; i < base64s.length; i++) {
        const imgId = `${id}-${Date.now()}-${i}.png`
        const ok = await saveImage(imgId, base64s[i])
        if (!ok) throw new Error(`Failed to save image ${i + 1}`)
        setImageCache(prev => ({ ...prev, [imgId]: base64s[i] }))
        newIds.push(imgId)
      }
      // Use functional updater to avoid stale closure on imageIds
      updateCaptures(prev => prev.map(c =>
        c.id === id ? { ...c, imageIds: [...c.imageIds, ...newIds] } : c
      ))
      setUploadStatus({ type: 'success', msg: `${base64s.length} image${base64s.length > 1 ? 's' : ''} added` })
    } catch {
      setUploadStatus({ type: 'error', msg: 'Failed to upload images' })
    } finally {
      setUploading(null)
    }
  }

  const removeImageFromCapture = async (captureId: string, imgId: string) => {
    const cap = captures.find(c => c.id === captureId)
    if (!cap) return
    await deleteImage(imgId)
    const newIds = cap.imageIds.filter(i => i !== imgId)
    setField(captureId, { imageIds: newIds })
    // Adjust gallery index if needed
    setGalleryIndex(prev => {
      const idx = prev[captureId] || 0
      if (idx >= newIds.length) return { ...prev, [captureId]: Math.max(0, newIds.length - 1) }
      return prev
    })
  }

  // Paste handler
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault()
        Promise.all(imageFiles.map(f => fileToBase64(f))).then(b64s => addCapture(b64s))
      }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [addCapture])

  // Drop handlers
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const imageFiles: File[] = []
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i]
      if (file.type.startsWith('image/')) imageFiles.push(file)
    }
    if (imageFiles.length > 0) {
      Promise.all(imageFiles.map(f => fileToBase64(f))).then(b64s => addCapture(b64s))
    }
  }, [addCapture])

  // Filter + search
  const filtered = useMemo(() => {
    const lowerSearch = search.toLowerCase()
    return captures.filter(c =>
      (!filterSource || c.source === filterSource) &&
      (!search || c.title.toLowerCase().includes(lowerSearch) || c.content.toLowerCase().includes(lowerSearch))
    )
  }, [captures, filterSource, search])

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of captures) counts[c.source] = (counts[c.source] || 0) + 1
    return counts
  }, [captures])

  return (
    <PageShell>
      {/* Section header (the topbar owns the route title — this is the tab-section header) */}
      <PageHeader
        title="Captures"
        subtitle={`${captures.length} items — paste a screenshot or drop an image`}
        actions={
          <Button size="sm" onClick={() => addCapture()}>
            <Plus /> Add
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip selectable selected={!filterSource} onClick={() => setFilterSource(null)}>
            All
          </Chip>
          {SOURCES.map(s => (
            <Chip
              key={s}
              selectable
              selected={filterSource === s}
              onClick={() => setFilterSource(filterSource === s ? null : s)}
            >
              {sourceLabel[s]}{sourceCounts[s] ? ` (${sourceCounts[s]})` : ''}
            </Chip>
          ))}
        </div>
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-faint" />
          <Input
            placeholder="Search captures..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-7 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={dropRef}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex items-center justify-center gap-3 rounded-xl border border-dashed py-6 transition-colors duration-150 ${dragOver ? 'border-accent/40 bg-accent/5' : 'border-border/60 hover:border-accent/40'}`}
      >
        <ClipboardPaste className="h-4 w-4 text-foreground-faint" />
        <p className="text-xs text-foreground-faint">
          <span className="font-mono text-2xs text-muted-foreground">Ctrl+V</span> to paste screenshot or{' '}
          <span className="font-medium text-muted-foreground">drop image</span> here
        </p>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          message="Nothing captured yet."
          hint="Paste a screenshot, drop an image, or press Add — everything you save lands here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(cap => {
            const isExpanded = expanded === cap.id
            const hasImages = cap.imageIds.length > 0
            const currentIdx = galleryIndex[cap.id] || 0
            const thumbSrc = hasImages ? imageCache[cap.imageIds[0]] : null
            const currentSrc = hasImages ? imageCache[cap.imageIds[currentIdx]] : null

            return (
              <div
                key={cap.id}
                className={`surface overflow-hidden rounded-xl transition-colors duration-150 ${isExpanded ? 'sm:col-span-2 lg:col-span-3' : 'cursor-pointer hover:border-input'}`}
                onClick={() => !isExpanded && setExpanded(cap.id)}
              >
                {/* Image(s) */}
                {isExpanded && hasImages ? (
                  <div className="relative max-h-[400px] overflow-hidden border-b border-border bg-muted/40" onTouchStart={onTouchStart} onTouchEnd={makeSwipeHandler(cap.id, cap.imageIds.length)}>
                    {currentSrc && <img src={currentSrc} alt="" className="h-full w-full cursor-pointer object-cover" onClick={e => { e.stopPropagation(); setLightbox({ imageIds: cap.imageIds, index: currentIdx }) }} />}
                    {cap.imageIds.length > 1 && (
                      <>
                        {/* Compact overlay controls: scrim buttons over imagery (too small
                            for Button chrome); focus ring comes from the global rule. */}
                        <button
                          aria-label="Previous image"
                          onClick={e => { e.stopPropagation(); setGalleryIndex(prev => ({ ...prev, [cap.id]: (currentIdx - 1 + cap.imageIds.length) % cap.imageIds.length })) }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-black/50 p-2 text-white transition-colors duration-150 hover:bg-black/70 md:p-1"
                        >
                          <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" />
                        </button>
                        <button
                          aria-label="Next image"
                          onClick={e => { e.stopPropagation(); setGalleryIndex(prev => ({ ...prev, [cap.id]: (currentIdx + 1) % cap.imageIds.length })) }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-black/50 p-2 text-white transition-colors duration-150 hover:bg-black/70 md:p-1"
                        >
                          <ChevronRight className="h-5 w-5 md:h-4 md:w-4" />
                        </button>
                        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                          {cap.imageIds.map((_, i) => (
                            <button
                              key={i}
                              aria-label={`Go to image ${i + 1}`}
                              onClick={e => { e.stopPropagation(); setGalleryIndex(prev => ({ ...prev, [cap.id]: i })) }}
                              className={`h-1.5 cursor-pointer rounded-full transition-all duration-150 ${i === currentIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : thumbSrc ? (
                  <div className="relative max-h-[180px] overflow-hidden border-b border-border bg-muted/40">
                    <img src={thumbSrc} alt="" className="h-full w-full object-cover" onClick={e => { e.stopPropagation(); setLightbox({ imageIds: cap.imageIds, index: 0 }) }} />
                    {cap.imageIds.length > 1 && (
                      <span className="absolute right-2 top-2 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-2xs tabular-nums text-white">
                        {cap.imageIds.length}
                      </span>
                    )}
                  </div>
                ) : null}

                {/* Content */}
                <div className="p-4">
                  {isExpanded ? (
                    <div className="flex flex-col gap-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon-xs" aria-label="Collapse" onClick={() => setExpanded(null)}>
                            <Minus />
                          </Button>
                          <Chip size="sm">{sourceLabel[cap.source]}</Chip>
                          <span className="font-mono text-2xs text-foreground-faint">{timeAgo(cap.createdAt)}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Delete capture"
                          className="hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => deleteCapture(cap.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <Input
                        value={cap.title}
                        onChange={e => setField(cap.id, { title: e.target.value })}
                        placeholder="Title"
                        className="h-9 text-base font-semibold"
                      />
                      <NotesField
                        value={cap.content}
                        onChange={v => setField(cap.id, { content: v })}
                        title={cap.title}
                        onChangeTitle={v => setField(cap.id, { title: v })}
                        images={imageCache}
                        onAddImage={b64s => addInlineImagesToCapture(cap.id, b64s)}
                        placeholder="Click to write notes… (Markdown, or paste rich text)"
                        minHeight={80}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-2xs text-muted-foreground">Source</label>
                          <select
                            value={cap.source}
                            onChange={e => setField(cap.id, { source: e.target.value as CaptureSource })}
                            className={selectCls}
                          >
                            {SOURCES.map(s => <option key={s} value={s}>{sourceLabel[s]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-2xs text-muted-foreground">URL</label>
                          <div className="relative">
                            <Link className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-foreground-faint" />
                            <Input
                              value={cap.url}
                              onChange={e => setField(cap.id, { url: e.target.value })}
                              placeholder="https://..."
                              className="h-8 pl-7 font-mono text-xs"
                            />
                          </div>
                        </div>
                      </div>
                      {/* Image thumbnails with remove */}
                      {cap.imageIds.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {cap.imageIds.map((imgId, i) => (
                            <div key={imgId} className="group relative">
                              {imageCache[imgId] && (
                                <img src={imageCache[imgId]} alt="" className="h-16 w-16 cursor-pointer rounded-md border border-border object-cover" onClick={() => setLightbox({ imageIds: cap.imageIds, index: i })} />
                              )}
                              {/* Compact overlay control: floating remove badge on a thumbnail. */}
                              <button
                                aria-label="Remove image"
                                onClick={() => removeImageFromCapture(cap.id, imgId)}
                                className="absolute -right-1.5 -top-1.5 cursor-pointer rounded-full border border-border bg-background/90 p-0.5 text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-destructive group-hover:opacity-100"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                              <span className="absolute bottom-0.5 right-0.5 rounded-full bg-black/50 px-1 font-mono text-3xs tabular-nums text-white">{i + 1}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <label className={`flex items-center justify-center gap-2 rounded-md border border-dashed py-3 text-xs transition-colors duration-150 ${uploading === cap.id ? 'cursor-wait border-border/60 text-muted-foreground' : 'cursor-pointer border-border/60 text-foreground-faint hover:border-accent/40 hover:text-accent'}`}>
                        {uploading === cap.id ? (
                          <>
                            <Skeleton className="h-3.5 w-3.5 rounded-full" />
                            Uploading…
                          </>
                        ) : (
                          <>
                            <ImageIcon className="h-3.5 w-3.5" />
                            Add {cap.imageIds.length > 0 ? 'more ' : ''}photos
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={uploading === cap.id}
                          onChange={async e => {
                            const files = e.target.files
                            if (!files?.length) return
                            const b64s = await Promise.all(Array.from(files).map(f => fileToBase64(f)))
                            await addImagesToCapture(cap.id, b64s)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {/* Upload status (transient confirmation) */}
                      {uploadStatus && expanded === cap.id && (
                        <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${uploadStatus.type === 'success' ? 'border-success/25 bg-success/10 text-success' : 'border-destructive/25 bg-destructive/10 text-destructive'}`}>
                          {uploadStatus.type === 'success' ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          {uploadStatus.msg}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium">{cap.title || <span className="italic text-foreground-faint">Untitled</span>}</p>
                      {cap.content && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{cap.content}</p>}
                      <div className="mt-2 flex items-center gap-2">
                        <Chip size="sm">{sourceLabel[cap.source]}</Chip>
                        <span className="font-mono text-2xs text-foreground-faint">{timeAgo(cap.createdAt)}</span>
                        {cap.imageIds.length > 0 && (
                          <span className="flex items-center gap-0.5 font-mono text-3xs tabular-nums text-foreground-faint">
                            <ImageIcon className="h-2.5 w-2.5" /> {cap.imageIds.length}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Fullscreen lightbox — the one app Modal, full size */}
      <Modal
        open={!!lightbox}
        onOpenChange={(o) => { if (!o) setLightbox(null) }}
        size="full"
        className="grid-rows-[1fr] [-webkit-app-region:no-drag]"
      >
        {lightbox && (
          <div
            className="relative flex h-full flex-col items-center justify-center gap-3"
            onTouchStart={onTouchStart}
            onTouchEnd={onLightboxSwipe}
          >
            {lightbox.imageIds.length > 1 && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {lightbox.index + 1} / {lightbox.imageIds.length}
              </span>
            )}
            <img
              src={imageCache[lightbox.imageIds[lightbox.index]]}
              alt=""
              className="min-h-0 max-w-full flex-1 rounded-md object-contain"
            />
            {lightbox.imageIds.length > 1 && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Previous image"
                  className="absolute left-0 top-1/2 -translate-y-1/2"
                  onClick={() => setLightbox(prev => prev ? { ...prev, index: (prev.index - 1 + prev.imageIds.length) % prev.imageIds.length } : null)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Next image"
                  className="absolute right-0 top-1/2 -translate-y-1/2"
                  onClick={() => setLightbox(prev => prev ? { ...prev, index: (prev.index + 1) % prev.imageIds.length } : null)}
                >
                  <ChevronRight />
                </Button>
                <div className="flex gap-2">
                  {/* Compact gallery-dot pattern — too small for Button chrome;
                      focus ring comes from the global :focus-visible rule. */}
                  {lightbox.imageIds.map((_, i) => (
                    <button
                      key={i}
                      aria-label={`Go to image ${i + 1}`}
                      onClick={() => setLightbox(prev => prev ? { ...prev, index: i } : null)}
                      className={`h-2 cursor-pointer rounded-full transition-all duration-150 ${i === lightbox.index ? 'w-6 bg-foreground' : 'w-2 bg-muted-foreground/40 hover:bg-muted-foreground'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </PageShell>
  )
}
