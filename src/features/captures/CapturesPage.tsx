import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { NotesField } from '@/components/shared/NotesField'
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
  Camera,
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

const sourceColor: Record<CaptureSource, string> = {
  x: 'bg-gray-500/15 text-gray-300',
  tiktok: 'bg-pink-500/15 text-pink-400',
  linkedin: 'bg-blue-500/15 text-blue-400',
  reddit: 'bg-orange-500/15 text-orange-400',
  article: 'bg-emerald-500/15 text-emerald-400',
  screenshot: 'bg-purple-500/15 text-purple-400',
  other: 'bg-yellow-500/15 text-yellow-400',
}

const sourceBorder: Record<CaptureSource, string> = {
  x: 'border-l-gray-500/40',
  tiktok: 'border-l-pink-500/40',
  linkedin: 'border-l-blue-500/40',
  reddit: 'border-l-orange-500/40',
  article: 'border-l-emerald-500/40',
  screenshot: 'border-l-purple-500/40',
  other: 'border-l-yellow-500/40',
}

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

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Captures</h1>
          <p className="text-xs text-muted-foreground">{captures.length} <span className="text-purple-400/60">items</span> · Paste screenshot or drop image</p>
        </div>
        <button
          onClick={() => addCapture()}
          className="cursor-pointer flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/90 text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterSource(null)}
            className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${!filterSource ? 'bg-foreground/10 text-foreground border-foreground/20' : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}
          >
            All
          </button>
          {SOURCES.map(s => (
            <button
              key={s}
              onClick={() => setFilterSource(filterSource === s ? null : s)}
              className={`cursor-pointer text-[10px] px-2.5 py-1 rounded-full border transition-all ${filterSource === s ? `${sourceColor[s]} border-current/20` : 'border-border text-muted-foreground/40 hover:text-muted-foreground'}`}
            >
              {sourceLabel[s]} {sourceCounts[s] ? `(${sourceCounts[s]})` : ''}
            </button>
          ))}
        </div>
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
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
        className={`flex items-center justify-center gap-3 rounded-xl border-2 border-dashed py-6 transition-all ${dragOver ? 'border-indigo-400/50 bg-indigo-500/5' : 'border-border/40 hover:border-purple-500/30'}`}
      >
        <ClipboardPaste className="h-4 w-4 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground/50">
          <span className="font-medium text-muted-foreground/70">Ctrl+V</span> to paste screenshot or <span className="font-medium text-muted-foreground/70">drop image</span> here
        </p>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <WidgetCard title="No captures yet" description="Paste a screenshot or click Add to get started" delay={0.1}>
          <div className="flex flex-col items-center gap-3 py-8">
            <Camera className="h-10 w-10 text-purple-400/20" />
            <p className="text-xs text-muted-foreground/50">Your captured ideas, screenshots, and posts will appear here</p>
          </div>
        </WidgetCard>
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
                className={`liquid-glass rounded-xl border border-border border-l-2 ${sourceBorder[cap.source]} overflow-hidden transition-all ${isExpanded ? 'sm:col-span-2 lg:col-span-3' : 'cursor-pointer hover:border-foreground/20'}`}
                onClick={() => !isExpanded && setExpanded(cap.id)}
              >
                {/* Image(s) */}
                {isExpanded && hasImages ? (
                  <div className="relative bg-zinc-700/50 max-h-[400px] overflow-hidden border-b border-zinc-600/50" onTouchStart={onTouchStart} onTouchEnd={makeSwipeHandler(cap.id, cap.imageIds.length)}>
                    {currentSrc && <img src={currentSrc} alt="" className="w-full h-full object-cover cursor-pointer" onClick={e => { e.stopPropagation(); setLightbox({ imageIds: cap.imageIds, index: currentIdx }) }} />}
                    {cap.imageIds.length > 1 && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); setGalleryIndex(prev => ({ ...prev, [cap.id]: (currentIdx - 1 + cap.imageIds.length) % cap.imageIds.length })) }}
                          className="cursor-pointer absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 md:p-1 transition-colors"
                        >
                          <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setGalleryIndex(prev => ({ ...prev, [cap.id]: (currentIdx + 1) % cap.imageIds.length })) }}
                          className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 md:p-1 transition-colors"
                        >
                          <ChevronRight className="h-5 w-5 md:h-4 md:w-4" />
                        </button>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {cap.imageIds.map((_, i) => (
                            <button
                              key={i}
                              onClick={e => { e.stopPropagation(); setGalleryIndex(prev => ({ ...prev, [cap.id]: i })) }}
                              className={`cursor-pointer h-1.5 rounded-full transition-all ${i === currentIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : thumbSrc ? (
                  <div className="bg-zinc-700/50 max-h-[180px] overflow-hidden relative border-b border-zinc-600/50">
                    <img src={thumbSrc} alt="" className="w-full h-full object-cover" onClick={e => { e.stopPropagation(); setLightbox({ imageIds: cap.imageIds, index: 0 }) }} />
                    {cap.imageIds.length > 1 && (
                      <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">
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
                          <button onClick={() => setExpanded(null)} className="cursor-pointer text-muted-foreground/40 hover:text-foreground transition-colors" title="Collapse">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full ${sourceColor[cap.source]}`}>
                            {sourceLabel[cap.source]}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">{timeAgo(cap.createdAt)}</span>
                        </div>
                        <button onClick={() => deleteCapture(cap.id)} className="cursor-pointer text-muted-foreground/40 hover:text-red-400 transition-colors" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
                          <label className="text-[10px] text-muted-foreground mb-1 block">Source</label>
                          <select
                            value={cap.source}
                            onChange={e => setField(cap.id, { source: e.target.value as CaptureSource })}
                            className="w-full h-8 rounded-md border border-border bg-input px-2 text-xs outline-none"
                          >
                            {SOURCES.map(s => <option key={s} value={s}>{sourceLabel[s]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-1 block">URL</label>
                          <div className="relative">
                            <Link className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
                            <Input
                              value={cap.url}
                              onChange={e => setField(cap.id, { url: e.target.value })}
                              placeholder="https://..."
                              className="h-8 pl-7 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                      {/* Image thumbnails with remove */}
                      {cap.imageIds.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {cap.imageIds.map((imgId, i) => (
                            <div key={imgId} className="relative group">
                              {imageCache[imgId] && (
                                <img src={imageCache[imgId]} alt="" className="h-16 w-16 rounded-md object-cover border border-white/10 ring-1 ring-white/5 cursor-pointer" onClick={() => setLightbox({ imageIds: cap.imageIds, index: i })} />
                              )}
                              <button
                                onClick={() => removeImageFromCapture(cap.id, imgId)}
                                className="cursor-pointer absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                              <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/50 text-white px-1 rounded">{i + 1}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <label className={`flex items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-xs transition-all ${uploading === cap.id ? 'border-purple-500/40 text-purple-300/70 animate-pulse cursor-wait' : 'cursor-pointer border-purple-500/20 text-muted-foreground/50 hover:border-purple-500/40 hover:text-purple-300/70'}`}>
                        {uploading === cap.id ? (
                          <>
                            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>
                            Uploading...
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
                      {/* Upload status toast */}
                      {uploadStatus && expanded === cap.id && (
                        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${uploadStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {uploadStatus.type === 'success' ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          {uploadStatus.msg}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium truncate">{cap.title || <span className="text-muted-foreground/40 italic">Untitled</span>}</p>
                      {cap.content && <p className="text-xs text-muted-foreground/70 line-clamp-2 mt-0.5 leading-relaxed">{cap.content}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full ${sourceColor[cap.source]}`}>
                          {sourceLabel[cap.source]}
                        </span>
                        <span className="text-[10px] text-muted-foreground/40">{timeAgo(cap.createdAt)}</span>
                        {cap.imageIds.length > 0 && (
                          <span className="text-[9px] text-purple-400/50 flex items-center gap-0.5">
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
      {/* Fullscreen lightbox */}
      {lightbox && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm [-webkit-app-region:no-drag]"
          onClick={() => setLightbox(null)}
          onTouchStart={onTouchStart}
          onTouchEnd={onLightboxSwipe}
        >
          {/* Close button */}
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null) }}
            className="cursor-pointer absolute right-4 text-white/70 hover:text-white transition-colors z-10 top-[calc(1rem+env(safe-area-inset-top))] [-webkit-app-region:no-drag]"
          >
            <X className="h-7 w-7" />
          </button>

          {/* Counter */}
          {lightbox.imageIds.length > 1 && (
            <span className="absolute left-1/2 -translate-x-1/2 text-white/70 text-sm top-[calc(1.25rem+env(safe-area-inset-top))]">
              {lightbox.index + 1} / {lightbox.imageIds.length}
            </span>
          )}

          {/* Image */}
          <img
            src={imageCache[lightbox.imageIds[lightbox.index]]}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />

          {/* Navigation */}
          {lightbox.imageIds.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: (prev.index - 1 + prev.imageIds.length) % prev.imageIds.length } : null) }}
                className="cursor-pointer absolute left-2 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 md:p-2 transition-colors"
              >
                <ChevronLeft className="h-7 w-7 md:h-6 md:w-6" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: (prev.index + 1) % prev.imageIds.length } : null) }}
                className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 md:p-2 transition-colors"
              >
                <ChevronRight className="h-7 w-7 md:h-6 md:w-6" />
              </button>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                {lightbox.imageIds.map((_, i) => (
                  <button
                    key={i}
                    onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: i } : null) }}
                    className={`cursor-pointer h-2 rounded-full transition-all ${i === lightbox.index ? 'w-6 bg-white' : 'w-2 bg-white/40'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </PageShell>
  )
}
