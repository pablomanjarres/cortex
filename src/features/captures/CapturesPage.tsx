import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
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
  ClipboardPaste,
  Camera,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type CaptureSource = 'x' | 'tiktok' | 'linkedin' | 'reddit' | 'article' | 'screenshot' | 'other'

interface Capture {
  id: string
  title: string
  content: string
  source: CaptureSource
  url: string
  imageId: string
  createdAt: string
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

// ── Media helpers ────────────────────────────────────────────────────────────

async function saveImage(id: string, base64: string): Promise<boolean> {
  if (window.electronAPI?.media) {
    return window.electronAPI.media.save(id, base64)
  }
  try { localStorage.setItem(`cortex-capture-img-${id}`, base64); return true } catch { return false }
}

async function loadImage(id: string): Promise<string | null> {
  if (window.electronAPI?.media) {
    return window.electronAPI.media.load(id)
  }
  return localStorage.getItem(`cortex-capture-img-${id}`)
}

async function deleteImage(id: string): Promise<void> {
  if (window.electronAPI?.media) {
    await window.electronAPI.media.delete(id)
  } else {
    localStorage.removeItem(`cortex-capture-img-${id}`)
  }
}

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
  const [captures, updateCaptures] = useStore<Capture[]>('cortex-captures', [])
  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState<CaptureSource | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [imageCache, setImageCache] = useState<Record<string, string>>({})
  const [dragOver, setDragOver] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  // Load images for visible captures
  useEffect(() => {
    const toLoad = captures.filter(c => c.imageId && !imageCache[c.imageId])
    if (toLoad.length === 0) return
    Promise.all(toLoad.map(async c => {
      const data = await loadImage(c.imageId)
      return [c.imageId, data] as const
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

  const addCapture = useCallback(async (imageBase64?: string) => {
    const id = `cap-${Date.now()}`
    const imageId = imageBase64 ? `${id}.png` : ''
    if (imageBase64 && imageId) {
      await saveImage(imageId, imageBase64)
      setImageCache(prev => ({ ...prev, [imageId]: imageBase64 }))
    }
    const capture: Capture = {
      id,
      title: '',
      content: '',
      source: imageBase64 ? 'screenshot' : 'other',
      url: '',
      imageId,
      createdAt: new Date().toISOString(),
    }
    updateCaptures(prev => [capture, ...prev])
    setExpanded(id)
  }, [updateCaptures])

  const setField = (id: string, field: Partial<Capture>) =>
    updateCaptures(prev => prev.map(c => c.id === id ? { ...c, ...field } : c))

  const deleteCapture = async (id: string) => {
    const cap = captures.find(c => c.id === id)
    if (cap?.imageId) await deleteImage(cap.imageId)
    updateCaptures(prev => prev.filter(c => c.id !== id))
    if (expanded === id) setExpanded(null)
  }

  const addImageToCapture = async (id: string, base64: string) => {
    const imageId = `${id}.png`
    await saveImage(imageId, base64)
    setImageCache(prev => ({ ...prev, [imageId]: base64 }))
    setField(id, { imageId })
  }

  // Paste handler
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) fileToBase64(file).then(b64 => addCapture(b64))
          return
        }
      }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [addCapture])

  // Drop handlers
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) {
      fileToBase64(file).then(b64 => addCapture(b64))
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
          <p className="text-xs text-muted-foreground">{captures.length} items · Paste screenshot or drop image</p>
        </div>
        <button
          onClick={() => addCapture()}
          className="cursor-pointer flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-foreground text-background hover:opacity-80 transition-opacity"
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
        className={`flex items-center justify-center gap-3 rounded-xl border-2 border-dashed py-6 transition-all ${dragOver ? 'border-foreground/40 bg-foreground/5' : 'border-border/40 hover:border-border'}`}
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
            <Camera className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground/50">Your captured ideas, screenshots, and posts will appear here</p>
          </div>
        </WidgetCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(cap => {
            const isExpanded = expanded === cap.id
            const imgSrc = cap.imageId ? imageCache[cap.imageId] : null

            return (
              <div
                key={cap.id}
                className={`liquid-glass rounded-xl border border-border overflow-hidden transition-all ${isExpanded ? 'sm:col-span-2 lg:col-span-3' : 'cursor-pointer hover:border-foreground/20'}`}
                onClick={() => !isExpanded && setExpanded(cap.id)}
              >
                {/* Image */}
                {imgSrc && (
                  <div className={`bg-secondary/30 ${isExpanded ? 'max-h-[400px]' : 'max-h-[180px]'} overflow-hidden`}>
                    <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Content */}
                <div className="p-4">
                  {isExpanded ? (
                    <div className="flex flex-col gap-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full ${sourceColor[cap.source]}`}>
                            {sourceLabel[cap.source]}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">{timeAgo(cap.createdAt)}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => setExpanded(null)} className="cursor-pointer text-muted-foreground/40 hover:text-foreground transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deleteCapture(cap.id)} className="cursor-pointer text-muted-foreground/40 hover:text-red-400 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <Input
                        value={cap.title}
                        onChange={e => setField(cap.id, { title: e.target.value })}
                        placeholder="Title"
                        className="h-8 text-sm font-medium"
                      />
                      <textarea
                        value={cap.content}
                        onChange={e => setField(cap.id, { content: e.target.value })}
                        placeholder="Notes, thoughts, context..."
                        className="min-h-[80px] w-full rounded-md border border-border bg-input px-3 py-2 text-xs resize-y outline-none"
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
                      {!cap.imageId && (
                        <label className="cursor-pointer flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/40 py-3 text-xs text-muted-foreground/50 hover:border-border hover:text-muted-foreground transition-all">
                          <ImageIcon className="h-3.5 w-3.5" />
                          Add image
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async e => {
                              const file = e.target.files?.[0]
                              if (file) {
                                const b64 = await fileToBase64(file)
                                await addImageToCapture(cap.id, b64)
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium truncate">{cap.title || 'Untitled'}</p>
                      {cap.content && <p className="text-[11px] text-muted-foreground/60 line-clamp-2 mt-0.5">{cap.content}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full ${sourceColor[cap.source]}`}>
                          {sourceLabel[cap.source]}
                        </span>
                        <span className="text-[10px] text-muted-foreground/40">{timeAgo(cap.createdAt)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
