import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Modal } from '@/components/shared/Modal'
import { Skeleton } from '@/components/shared/Skeleton'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { stepIndex, swipeStep, type Point } from '@/lib/media-navigation'
import { cn } from '@/lib/utils'

const viewerClass = 'grid-rows-[minmax(0,1fr)] [-webkit-app-region:no-drag]'

/** Compact image markers with full-size pointer and keyboard targets. */
export function ImageDots({ count, index, onChange, overlay = false }: {
  count: number
  index: number
  onChange: (index: number) => void
  overlay?: boolean
}) {
  return (
    <div className="flex max-w-full flex-wrap justify-center" role="group" aria-label="Image selection">
      {Array.from({ length: count }, (_, i) => (
        <Button key={i} variant="ghost" size="icon-lg" type="button" aria-label={`Go to image ${i + 1}`}
          aria-current={i === index || undefined} onClick={e => { e.stopPropagation(); onChange(i) }}
          className="h-11 w-11 rounded-full p-0">
          <span aria-hidden className={cn('h-2 rounded-full transition-all duration-150',
            i === index ? 'w-6' : 'w-2', overlay
              ? i === index ? 'bg-white' : 'bg-white/50'
              : i === index ? 'bg-foreground' : 'bg-muted-foreground/40')} />
        </Button>
      ))}
    </div>
  )
}

interface PdfViewerProps {
  /** Original filename: shown in the header and used for the download. */
  name: string
  /** Data URL once the bytes have loaded; a skeleton shows until then. */
  src?: string | null
  onClose: () => void
}

/** Full-size PDF viewer with a "Save" download once the bytes are loaded. */
export function PdfViewer({ name, src, onClose }: PdfViewerProps) {
  return (
    <Modal open onOpenChange={o => { if (!o) onClose() }} size="full" aria-label={name} className={viewerClass}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3 pr-8">
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{name}</span>
          {src && (
            <a href={src} download={name} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              <Download /> Save
            </a>
          )}
        </div>
        <div className="min-h-0 flex-1 pt-3">
          {src
            ? <iframe src={src} title={name} className="h-full w-full border-0" />
            : (
              <div className="flex h-full flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="min-h-0 w-full flex-1" />
              </div>
            )}
        </div>
      </div>
    </Modal>
  )
}

interface ImageLightboxProps {
  /** One data URL per image; `undefined` while that image is still loading. */
  srcs: (string | undefined)[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  alt?: string
  /** Show a dot per image under the picture. */
  showDots?: boolean
}

/**
 * Full-size image viewer. With several images it wraps around via the buttons,
 * ArrowLeft/ArrowRight and a horizontal swipe past 40px; Escape closes via Modal.
 */
export function ImageLightbox({ srcs, index, onIndexChange, onClose, alt = '', showDots = false }: ImageLightboxProps) {
  const count = srcs.length
  const multiple = count > 1
  const touchStart = useRef<Point | null>(null)
  const step = (delta: number) => onIndexChange(stepIndex(index, delta, count))

  useEffect(() => {
    if (!multiple) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault()
      if (e.key === 'ArrowLeft') onIndexChange(stepIndex(index, -1, count))
      if (e.key === 'ArrowRight') onIndexChange(stepIndex(index, 1, count))
    }
    // Dialog focus management consumes bubbling arrow events.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [multiple, index, count, onIndexChange])

  const src = srcs[index]

  return (
    <Modal open onOpenChange={o => { if (!o) onClose() }} size="full" aria-label={alt || 'Image viewer'} className={viewerClass}>
      <div
        className="relative flex h-full min-h-0 flex-col items-center justify-center gap-3"
        onTouchStart={e => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          const delta = multiple ? swipeStep(touchStart.current, { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }) : 0
          touchStart.current = null
          if (delta) step(delta)
        }}
      >
        {multiple && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {index + 1} / {count}
          </span>
        )}
        {src
          ? <img src={src} alt={alt} className="min-h-0 max-w-full flex-1 rounded-md object-contain" />
          : <Skeleton className="h-2/3 w-2/3" />}
        {multiple && (
          <>
            <Button variant="secondary" size="icon" aria-label="Previous image" className="absolute left-0 top-1/2 -translate-y-1/2" onClick={() => step(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="secondary" size="icon" aria-label="Next image" className="absolute right-0 top-1/2 -translate-y-1/2" onClick={() => step(1)}>
              <ChevronRight />
            </Button>
            {showDots && (
              <ImageDots count={count} index={index} onChange={onIndexChange} />
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
