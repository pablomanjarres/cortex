import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { ImageDots, ImageLightbox } from '@/components/shared/MediaViewer'
import { Notice } from '@/components/shared/Notice'
import { Skeleton } from '@/components/shared/Skeleton'
import { NotesField } from '@/components/shared/NotesField'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SearchInput } from '@/components/shared/SearchInput'
import { Field } from '@/components/shared/Field'
import { useStore } from '@/lib/store'
import { timeAgo } from '@/lib/date-utils'
import { saveFile, loadFile, deleteFile, fileToDataUrl, dataUrlMime, mediaIdFor, uploadLimitError } from '@/lib/media'
import { stepIndex, swipeStep } from '@/lib/media-navigation'
import {
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

type LegacyCapture = Omit<Capture, 'imageIds'> & { imageId: string }
type StoredCapture = Capture | LegacyCapture

/** Migrate legacy captures that had a single `imageId` string */
function migrateCapture(raw: StoredCapture): Capture {
  if ('imageIds' in raw) return raw
  const { imageId, ...rest } = raw
  return { ...rest, imageIds: imageId ? [imageId] : [] }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SOURCES: CaptureSource[] = ['x', 'tiktok', 'linkedin', 'reddit', 'article', 'screenshot', 'other']

const sourceLabel: Record<CaptureSource, string> = {
  x: 'X', tiktok: 'TikTok', linkedin: 'LinkedIn', reddit: 'Reddit',
  article: 'Article', screenshot: 'Screenshot', other: 'Other',
}

// ── Notes editing ────────────────────────────────────────────────────────────
// Notes now use the shared <NotesField>: inline quick-edit for short jots,
// with an opt-in fullscreen mode for longer writing. See components/shared.

// ── Component ────────────────────────────────────────────────────────────────

export function CapturesPage() {
  const [rawCaptures, updateRawCaptures] = useStore<StoredCapture[]>('cortex-captures', [])
  const updateCaptures = useCallback((reducer: (previous: Capture[]) => Capture[]) => {
    updateRawCaptures((previous) => reducer(previous.map(migrateCapture)))
  }, [updateRawCaptures])

  // Migrate after persisted data arrives, preserving any concurrent edits.
  useEffect(() => {
    if (rawCaptures.some((capture) => !('imageIds' in capture))) {
      updateRawCaptures((previous) => previous.map(migrateCapture))
    }
  }, [rawCaptures, updateRawCaptures])

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

  const setLightboxIndex = useCallback((index: number) =>
    setLightbox(prev => prev ? { ...prev, index } : null), [])
  const stepGallery = (capId: string, delta: number, count: number) =>
    setGalleryIndex(prev => ({ ...prev, [capId]: stepIndex(prev[capId] || 0, delta, count) }))

  // Touch swipe helpers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const makeSwipeHandler = (capId: string, count: number) => (e: React.TouchEvent) => {
    if (count <= 1) return
    const touch = e.changedTouches[0]
    const step = swipeStep(touchStartRef.current, { x: touch.clientX, y: touch.clientY })
    if (step) stepGallery(capId, step, count)
    touchStartRef.current = null
  }

  // Load images for visible captures
  useEffect(() => {
    const allIds = captures.flatMap(c => c.imageIds)
    const toLoad = allIds.filter(id => id && !imageCache[id])
    if (toLoad.length === 0) return
    let cancelled = false
    Promise.all(toLoad.map(async id => {
      // No stored mime for captures: loadFile labels the bytes by their signature.
      const data = await loadFile(id)
      return [id, data] as const
    })).then(results => {
      const newCache: Record<string, string> = {}
      for (const [id, data] of results) {
        if (data) newCache[id] = data
      }
      if (!cancelled && Object.keys(newCache).length > 0) {
        setImageCache(prev => ({ ...prev, ...newCache }))
      }
    })
    return () => { cancelled = true }
  }, [captures, imageCache])

  const readImages = useCallback(async (files: File[]): Promise<string[]> => {
    const error = files.map(file => uploadLimitError(file)).find(Boolean)
    if (error) { setUploadStatus({ type: 'error', msg: error }); return [] }
    try { return await Promise.all(files.map(fileToDataUrl)) } catch {
      setUploadStatus({ type: 'error', msg: 'Could not read these images. Try again.' })
      return []
    }
  }, [])

  // Save images for a capture and cache them; ids of failed saves are left out.
  const persistImages = useCallback(async (captureId: string, base64s: string[]) => {
    const saved: string[] = []
    let failed = 0
    const stamp = Date.now()
    for (let i = 0; i < base64s.length; i++) {
      const imgId = mediaIdFor(captureId, i, '', dataUrlMime(base64s[i]) ?? 'image/png', stamp)
      if (!await saveFile(imgId, base64s[i])) { failed++; continue }
      setImageCache(prev => ({ ...prev, [imgId]: base64s[i] }))
      saved.push(imgId)
    }
    if (failed) setUploadStatus({ type: 'error', msg: 'Some images could not be saved. Check their size and try again.' })
    return { saved, failed }
  }, [])

  const attachImages = useCallback((captureId: string, ids: string[]) =>
    updateCaptures(prev => prev.map(c => c.id === captureId ? { ...c, imageIds: [...c.imageIds, ...ids] } : c)), [updateCaptures])

  const addCapture = useCallback(async (images?: string[]) => {
    const id = `cap-${Date.now()}`
    const imageIds = images?.length ? (await persistImages(id, images)).saved : []
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
  }, [persistImages, updateCaptures])

  const setField = (id: string, field: Partial<Capture>) =>
    updateCaptures(prev => prev.map(c => c.id === id ? { ...c, ...field } : c))

  // Persist images inserted from within the notes editor; returns their ids so
  // NotesField can drop `![](img:id)` tags into the markdown.
  const addInlineImagesToCapture = async (id: string, base64s: string[]): Promise<string[]> => {
    const { saved } = await persistImages(id, base64s)
    attachImages(id, saved)
    return saved
  }

  const deleteCapture = async (id: string) => {
    const cap = captures.find(c => c.id === id)
    if (cap) {
      for (const imgId of cap.imageIds) await deleteFile(imgId)
    }
    updateCaptures(prev => prev.filter(c => c.id !== id))
    if (expanded === id) setExpanded(null)
  }

  const addImagesToCapture = async (id: string, base64s: string[]) => {
    setUploading(id)
    try {
      const { saved, failed } = await persistImages(id, base64s)
      if (failed) {
        await Promise.all(saved.map(deleteFile))
        setUploadStatus({ type: 'error', msg: 'Failed to upload images' })
        return
      }
      attachImages(id, saved)
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
    await deleteFile(imgId)
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
        void readImages(imageFiles).then(b64s => { if (b64s.length) return addCapture(b64s) })
      }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [addCapture, readImages])

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
      void readImages(imageFiles).then(b64s => { if (b64s.length) return addCapture(b64s) })
    }
  }, [addCapture, readImages])

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

      {uploadStatus?.type === 'error' && <Notice tone="danger">{uploadStatus.msg}</Notice>}

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
        <SearchInput label="Search captures" placeholder="Search captures..." value={search} onChange={e => setSearch(e.target.value)} className="h-7 text-xs" containerClassName="max-w-xs" />
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
          <span className="font-mono text-2xs text-muted-foreground">⌘V</span> to paste screenshot or{' '}
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
                        <Button variant="secondary" size="icon-lg"
                          aria-label="Previous image"
                          onClick={e => { e.stopPropagation(); stepGallery(cap.id, -1, cap.imageIds.length) }}
                          className="absolute left-2 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full"
                        >
                          <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" />
                        </Button>
                        <Button variant="secondary" size="icon-lg"
                          aria-label="Next image"
                          onClick={e => { e.stopPropagation(); stepGallery(cap.id, 1, cap.imageIds.length) }}
                          className="absolute right-2 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full"
                        >
                          <ChevronRight className="h-5 w-5 md:h-4 md:w-4" />
                        </Button>
                        <div className="absolute bottom-0 left-1/2 w-full -translate-x-1/2">
                          <ImageDots count={cap.imageIds.length} index={currentIdx} overlay onChange={i => setGalleryIndex(prev => ({ ...prev, [cap.id]: i }))} />
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
                        <Field label="Source">
                          {(id) => (
                            <Select
                              id={id}
                              aria-label={`Source for ${cap.title || 'capture'}`}
                              value={cap.source}
                              onChange={e => setField(cap.id, { source: e.target.value as CaptureSource })}
                              className="h-8 px-2 text-xs"
                            >
                              {SOURCES.map(s => <option key={s} value={s}>{sourceLabel[s]}</option>)}
                            </Select>
                          )}
                        </Field>
                        <Field label="URL">
                          {(id) => (
                            <div className="relative">
                              <Link className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-foreground-faint" />
                              <Input
                                id={id}
                                value={cap.url}
                                onChange={e => setField(cap.id, { url: e.target.value })}
                                placeholder="https://..."
                                className="h-8 pl-7 font-mono text-xs"
                              />
                            </div>
                          )}
                        </Field>
                      </div>
                      {/* Image thumbnails with remove */}
                      {cap.imageIds.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {cap.imageIds.map((imgId, i) => (
                            <div key={imgId} className="group relative">
                              {imageCache[imgId] && (
                                <img src={imageCache[imgId]} alt="" className="h-16 w-16 cursor-pointer rounded-md border border-border object-cover" onClick={() => setLightbox({ imageIds: cap.imageIds, index: i })} />
                              )}
                              <Button variant="secondary" size="icon-xs"
                                aria-label="Remove image"
                                onClick={() => removeImageFromCapture(cap.id, imgId)}
                                className="absolute -right-1.5 -top-1.5 min-h-11 min-w-11 rounded-full text-muted-foreground opacity-100 hover:text-destructive sm:min-h-7 sm:min-w-7 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                              >
                                <X className="h-2.5 w-2.5" />
                              </Button>
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
                            const b64s = await readImages(Array.from(files))
                            if (b64s.length) await addImagesToCapture(cap.id, b64s)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {/* Upload status (transient confirmation) */}
                      {uploadStatus?.type === 'success' && expanded === cap.id && (
                        <div role="status" className="flex items-center gap-2 rounded-md border border-success/25 bg-success/10 px-3 py-2 text-xs font-medium text-success">
                          <Check className="h-3.5 w-3.5" />
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

      {lightbox && (
        <ImageLightbox
          srcs={lightbox.imageIds.map(id => imageCache[id])}
          index={lightbox.index}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightbox(null)}
          showDots
        />
      )}
    </PageShell>
  )
}
