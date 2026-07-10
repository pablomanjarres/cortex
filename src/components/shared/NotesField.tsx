import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import ReactDOM from 'react-dom'
import Markdown from 'react-markdown'
import TurndownService from 'turndown'
import {
  Bold, Italic, List, Heading2, Quote, Code, Image as ImageIcon,
  Maximize2, Check, Eye, Pencil, ChevronLeft,
} from 'lucide-react'

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })

// ── Shared bits ──────────────────────────────────────────────────────────────

/** Render markdown, resolving `img:<id>` sources from an in-memory cache. */
function mdImageRenderer(images: Record<string, string>, className: string) {
  return {
    img: ({ src, alt, ...props }: any) => {
      if (src?.startsWith('img:')) {
        const data = images[src.slice(4)]
        if (data) return <img src={data} alt={alt || ''} className={className} {...props} />
        return <span className="text-xs italic text-foreground-faint">[image loading…]</span>
      }
      return <img src={src} alt={alt} className={className} {...props} />
    },
  }
}

type MdApply = (prefix: string, suffix?: string) => void

/** Insert markdown around the current textarea selection. */
function makeInsert(ref: React.RefObject<HTMLTextAreaElement | null>, value: string, onChange: (v: string) => void): MdApply {
  return (prefix, suffix = '') => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end)
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = start + prefix.length
      ta.selectionEnd = start + prefix.length + selected.length
    })
  }
}

function ToolbarButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      // mousedown-preventDefault keeps focus in the textarea so inline mode
      // doesn't blur-and-close when a toolbar button is pressed.
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className="cursor-pointer p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      {children}
    </button>
  )
}

function FormatToolbar({ apply, onImage, className = '' }: { apply: MdApply; onImage?: () => void; className?: string }) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      <ToolbarButton onClick={() => apply('**', '**')} title="Bold"><Bold className="h-3.5 w-3.5" /></ToolbarButton>
      <ToolbarButton onClick={() => apply('*', '*')} title="Italic"><Italic className="h-3.5 w-3.5" /></ToolbarButton>
      <ToolbarButton onClick={() => apply('## ')} title="Heading"><Heading2 className="h-3.5 w-3.5" /></ToolbarButton>
      <ToolbarButton onClick={() => apply('- ')} title="List"><List className="h-3.5 w-3.5" /></ToolbarButton>
      <ToolbarButton onClick={() => apply('> ')} title="Quote"><Quote className="h-3.5 w-3.5" /></ToolbarButton>
      <ToolbarButton onClick={() => apply('`', '`')} title="Code"><Code className="h-3.5 w-3.5" /></ToolbarButton>
      {onImage && (
        <>
          <div className="w-px h-4 bg-border/60 mx-1" />
          <ToolbarButton onClick={onImage} title="Insert image"><ImageIcon className="h-3.5 w-3.5" /></ToolbarButton>
        </>
      )}
    </div>
  )
}

/** Paste-as-markdown: converts pasted rich HTML to markdown at the caret. */
function handleRichPaste(
  e: React.ClipboardEvent<HTMLTextAreaElement>,
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (v: string) => void,
) {
  const html = e.clipboardData.getData('text/html')
  if (!html) return // plain text — let the browser handle it
  e.preventDefault()
  const md = turndown.turndown(html).trim()
  const ta = ref.current
  if (!ta) { onChange(value + md); return }
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const next = value.slice(0, start) + md + value.slice(end)
  onChange(next)
  requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + md.length })
}

async function pickImages(onAddImage: (dataUrls: string[]) => Promise<string[]>, insertTags: (tags: string) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = async () => {
    if (!input.files?.length) return
    const b64s = await Promise.all(Array.from(input.files).map(f =>
      new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f) })
    ))
    const ids = await onAddImage(b64s)
    insertTags(ids.map(id => `![](img:${id})`).join('\n'))
  }
  input.click()
}

// ── Fullscreen editor (refined: centered reading column) ─────────────────────

function FullscreenEditor({
  title, value, onChangeTitle, onChange, onClose, onAddImage, images, placeholder,
}: {
  title?: string; value: string
  onChangeTitle?: (v: string) => void; onChange: (v: string) => void; onClose: () => void
  onAddImage?: (dataUrls: string[]) => Promise<string[]>; images: Record<string, string>; placeholder?: string
}) {
  const [preview, setPreview] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const apply = makeInsert(ref, value, onChange)
  const words = value.trim() ? value.trim().split(/\s+/).length : 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const insertImages = () => onAddImage && pickImages(onAddImage, tags => {
    const ta = ref.current
    const pos = ta ? ta.selectionStart : value.length
    onChange(value.slice(0, pos) + '\n' + tags + '\n' + value.slice(pos))
  })

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Bar */}
      <div className="flex items-center justify-between px-4 md:pl-20 py-3 border-b border-border">
        <button onClick={onClose} className="cursor-pointer flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors [-webkit-app-region:no-drag]">
          <ChevronLeft className="h-4 w-4" /> Done
        </button>
        <span className="font-mono text-2xs tabular-nums text-foreground-faint">{words} {words === 1 ? 'word' : 'words'}</span>
        <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
          <button onClick={() => setPreview(false)} className={`cursor-pointer px-2.5 py-1 rounded-md transition-colors ${!preview ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Write" aria-pressed={!preview}><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => setPreview(true)} className={`cursor-pointer px-2.5 py-1 rounded-md transition-colors ${preview ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Preview" aria-pressed={preview}><Eye className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* Centered reading column */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-3xl px-5 md:px-8 flex flex-col min-h-full">
          {onChangeTitle !== undefined && (
            <input
              value={title ?? ''}
              onChange={e => onChangeTitle?.(e.target.value)}
              placeholder="Title"
              className="pt-8 pb-3 text-2xl md:text-3xl font-semibold bg-transparent outline-none border-none text-foreground placeholder:text-foreground-faint font-serif"
            />
          )}

          {preview ? (
            <div className="py-4 prose prose-invert prose-sm md:prose-base max-w-none flex-1
              prose-headings:text-foreground prose-headings:font-serif prose-headings:mt-6 prose-headings:mb-3
              prose-p:text-foreground prose-p:leading-relaxed
              prose-strong:text-foreground
              prose-code:text-accent prose-code:bg-accent/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-sm prose-code:before:content-[''] prose-code:after:content-['']
              prose-blockquote:border-l-accent/40 prose-blockquote:text-muted-foreground
              prose-li:text-foreground prose-a:text-accent
              prose-hr:border-border/60">
              <Markdown components={mdImageRenderer(images, 'max-w-full rounded-md my-3 border border-border')} urlTransform={u => u}>
                {value || '*Nothing written yet.*'}
              </Markdown>
            </div>
          ) : (
            <>
              <FormatToolbar apply={apply} onImage={onAddImage ? insertImages : undefined} className="py-2 border-y border-border/60 mb-3 sticky top-0 bg-background/80 backdrop-blur-sm" />
              <textarea
                ref={ref}
                value={value}
                onChange={e => onChange(e.target.value)}
                onPaste={e => handleRichPaste(e, ref, value, onChange)}
                placeholder={placeholder || 'Write your notes here… (Markdown supported)'}
                className="flex-1 w-full pb-16 text-base leading-[1.75] bg-transparent outline-none resize-none text-foreground placeholder:text-foreground-faint"
                autoFocus
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── NotesField ───────────────────────────────────────────────────────────────

export interface NotesFieldProps {
  value: string
  onChange: (v: string) => void
  images?: Record<string, string>
  onAddImage?: (dataUrls: string[]) => Promise<string[]>
  placeholder?: string
  /** Title shown/edited in fullscreen mode (optional). */
  title?: string
  onChangeTitle?: (v: string) => void
  /** Min height of the collapsed preview / inline editor. */
  minHeight?: number
  className?: string
}

/**
 * Markdown notes with two ergonomics, side by side:
 *  • click → edit inline right where you are (fast, for short notes)
 *  • expand → distraction-free fullscreen (for long writing)
 * No jarring full-page takeover just to jot a line down.
 */
export function NotesField({
  value, onChange, images = {}, onAddImage, placeholder = 'Click to write…',
  title, onChangeTitle, minHeight = 96, className = '',
}: NotesFieldProps) {
  const [editing, setEditing] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const apply = makeInsert(ref, value, onChange)

  // Auto-grow the inline textarea to fit its content.
  useLayoutEffect(() => {
    if (!editing) return
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(minHeight, ta.scrollHeight)}px`
  }, [editing, value, minHeight])

  const insertImages = () => onAddImage && pickImages(onAddImage, tags => {
    const ta = ref.current
    const pos = ta ? ta.selectionStart : value.length
    onChange(value.slice(0, pos) + '\n' + tags + '\n' + value.slice(pos))
  })

  // Inline edit mode ----------------------------------------------------------
  if (editing) {
    return (
      <>
        <div
          className={`rounded-md border border-input bg-input/60 focus-within:border-ring/60 transition-colors ${className}`}
          // clicking anywhere but the textarea shouldn't blur-close
          onMouseDown={e => { if (e.target !== ref.current) e.preventDefault() }}
        >
          <div className="flex items-center justify-between px-2 py-1 border-b border-border/60">
            <FormatToolbar apply={apply} onImage={onAddImage ? insertImages : undefined} />
            <div className="flex items-center gap-0.5">
              <button type="button" onMouseDown={e => { e.preventDefault(); setFullscreen(true) }} title="Fullscreen" className="cursor-pointer p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button type="button" onMouseDown={e => { e.preventDefault(); setEditing(false) }} title="Done" className="cursor-pointer p-1.5 rounded-md text-success hover:bg-success/10 transition-colors">
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <textarea
            ref={ref}
            value={value}
            onChange={e => onChange(e.target.value)}
            onPaste={e => handleRichPaste(e, ref, value, onChange)}
            onBlur={() => setEditing(false)}
            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setEditing(false) } }}
            placeholder={placeholder}
            style={{ minHeight }}
            className="w-full px-3 py-2.5 text-sm leading-relaxed bg-transparent outline-none resize-none text-foreground placeholder:text-foreground-faint"
            autoFocus
          />
        </div>
        {fullscreen && (
          <FullscreenEditor
            title={title} value={value} images={images} placeholder={placeholder}
            onChangeTitle={onChangeTitle} onChange={onChange} onAddImage={onAddImage}
            onClose={() => setFullscreen(false)}
          />
        )}
      </>
    )
  }

  // Collapsed preview ---------------------------------------------------------
  return (
    <>
      <div
        onClick={() => setEditing(true)}
        style={{ minHeight }}
        className={`group relative cursor-text rounded-md border border-border bg-input/40 px-3 py-2.5 hover:border-input transition-colors ${className}`}
      >
        {value ? (
          <div className="prose prose-invert prose-sm max-w-none
            prose-headings:text-foreground prose-headings:font-serif prose-p:text-foreground prose-strong:text-foreground
            prose-code:text-accent prose-code:bg-accent/10 prose-code:px-1 prose-code:rounded-sm prose-code:before:content-[''] prose-code:after:content-['']
            prose-blockquote:border-l-accent/40 prose-li:text-foreground prose-a:text-accent prose-img:my-1">
            <Markdown components={mdImageRenderer(images, 'max-w-full rounded-md my-1')} urlTransform={u => u}>{value}</Markdown>
          </div>
        ) : (
          <span className="text-sm text-foreground-faint">{placeholder}</span>
        )}
        {/* hover actions */}
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setEditing(true) }}
            title="Edit inline"
            className="cursor-pointer p-1 rounded-md bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setFullscreen(true) }}
            title="Fullscreen"
            className="cursor-pointer p-1 rounded-md bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {fullscreen && (
        <FullscreenEditor
          title={title} value={value} images={images} placeholder={placeholder}
          onChangeTitle={onChangeTitle} onChange={onChange} onAddImage={onAddImage}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  )
}
