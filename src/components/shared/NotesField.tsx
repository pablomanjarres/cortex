import { useState, useRef, useLayoutEffect, type RefObject } from 'react'
import Markdown, { type Components } from 'react-markdown'
import TurndownService from 'turndown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/shared/Modal'
import {
  Bold, Italic, List, Heading2, Quote, Code, Image as ImageIcon,
  Maximize2, Check, Eye, Pencil, ChevronLeft,
} from 'lucide-react'

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })

// ── Shared bits ──────────────────────────────────────────────────────────────

/** Render markdown, resolving `img:<id>` sources from an in-memory cache. */
function mdImageRenderer(images: Record<string, string>, className: string): Components {
  return {
    img: ({ src, alt, ...props }) => {
      if (typeof src === 'string' && src.startsWith('img:')) {
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
function insertMarkdown(ref: RefObject<HTMLTextAreaElement | null>, value: string, onChange: (v: string) => void, prefix: string, suffix = '') {
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

function ToolbarButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      // mousedown-preventDefault keeps focus in the textarea so inline mode
      // doesn't blur-and-close when a toolbar button is pressed.
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </Button>
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
  open, returnFocus, title, value, onChangeTitle, onChange, onClose, onAddImage, images, placeholder,
}: {
  open: boolean; title?: string; value: string
  returnFocus: RefObject<HTMLButtonElement | null>
  onChangeTitle?: (v: string) => void; onChange: (v: string) => void; onClose: () => void
  onAddImage?: (dataUrls: string[]) => Promise<string[]>; images: Record<string, string>; placeholder?: string
}) {
  const [preview, setPreview] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const apply: MdApply = (prefix, suffix) => insertMarkdown(ref, value, onChange, prefix, suffix)
  const words = value.trim() ? value.trim().split(/\s+/).length : 0

  const insertImages = () => onAddImage && pickImages(onAddImage, tags => {
    const ta = ref.current
    const pos = ta ? ta.selectionStart : value.length
    onChange(value.slice(0, pos) + '\n' + tags + '\n' + value.slice(pos))
  })

  return (
    <Modal open={open} onOpenChange={open => { if (!open) onClose() }} size="full" aria-label="Notes editor" finalFocus={returnFocus} showCloseButton={false} className="grid-rows-1 gap-0 overflow-hidden p-0">
    <div className="flex h-full flex-col">
      {/* Bar */}
      <div className="flex items-center justify-between px-4 md:pl-20 py-3 border-b border-border">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="cursor-pointer flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors [-webkit-app-region:no-drag]">
          <ChevronLeft className="h-4 w-4" /> Done
        </Button>
        <span className="font-mono text-2xs tabular-nums text-foreground-faint">{words} {words === 1 ? 'word' : 'words'}</span>
        <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => setPreview(false)} className={`cursor-pointer px-2.5 py-1 rounded-md transition-colors ${!preview ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Write" aria-label="Write" aria-pressed={!preview}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => setPreview(true)} className={`cursor-pointer px-2.5 py-1 rounded-md transition-colors ${preview ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`} title="Preview" aria-label="Preview" aria-pressed={preview}><Eye className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Centered reading column */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-3xl px-5 md:px-8 flex flex-col min-h-full">
          {onChangeTitle !== undefined && (
            <Input
              aria-label="Notes title"
              value={title ?? ''}
              onChange={e => onChangeTitle?.(e.target.value)}
              placeholder="Title"
              variant="inline"
              className="h-auto border-0 pt-8 pb-3 text-2xl md:text-3xl font-semibold shadow-none"
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
              <Textarea
                variant="inline"
                ref={ref}
                value={value}
                onChange={e => onChange(e.target.value)}
                onPaste={e => handleRichPaste(e, ref, value, onChange)}
                placeholder={placeholder || 'Write your notes here… (Markdown supported)'}
                aria-label="Notes"
                className="flex-1 px-0 pb-16 text-base leading-[1.75] resize-none"
                autoFocus
              />
            </>
          )}
        </div>
      </div>
    </div>
    </Modal>
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
  const fullscreenTrigger = useRef<HTMLButtonElement>(null)
  const apply: MdApply = (prefix, suffix) => insertMarkdown(ref, value, onChange, prefix, suffix)

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
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setEditing(false) }}
        >
          <div className="flex items-center justify-between px-2 py-1 border-b border-border/60">
            <FormatToolbar apply={apply} onImage={onAddImage ? insertImages : undefined} />
            <div className="flex items-center gap-0.5">
              <Button ref={fullscreenTrigger} type="button" variant="ghost" size="icon-xs" onMouseDown={event => event.preventDefault()} onClick={() => setFullscreen(true)} title="Fullscreen" aria-label="Fullscreen">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" onMouseDown={event => event.preventDefault()} onClick={() => setEditing(false)} title="Done" aria-label="Done" className="text-success hover:bg-success/10">
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <Textarea
            variant="inline"
            ref={ref}
            value={value}
            onChange={e => onChange(e.target.value)}
            onPaste={e => handleRichPaste(e, ref, value, onChange)}
            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setEditing(false) } }}
            placeholder={placeholder}
            style={{ minHeight }}
            aria-label="Notes"
            className="px-3 py-2.5 text-sm leading-relaxed resize-none"
            autoFocus
          />
        </div>
          <FullscreenEditor
            open={fullscreen}
            returnFocus={fullscreenTrigger}
            title={title} value={value} images={images} placeholder={placeholder}
            onChangeTitle={onChangeTitle} onChange={onChange} onAddImage={onAddImage}
            onClose={() => setFullscreen(false)}
          />
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
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={e => { e.stopPropagation(); setEditing(true) }}
            title="Edit inline"
            aria-label="Edit inline"
            className="cursor-pointer p-1 rounded-md bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            ref={fullscreenTrigger}
            onClick={e => { e.stopPropagation(); setFullscreen(true) }}
            title="Fullscreen"
            aria-label="Fullscreen"
            className="cursor-pointer p-1 rounded-md bg-background/70 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
        <FullscreenEditor
          open={fullscreen}
          returnFocus={fullscreenTrigger}
          title={title} value={value} images={images} placeholder={placeholder}
          onChangeTitle={onChangeTitle} onChange={onChange} onAddImage={onAddImage}
          onClose={() => setFullscreen(false)}
        />
    </>
  )
}
