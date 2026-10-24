import type { ReactNode, Ref } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A table record that expands into a full-width detail row. The whole summary
 * row toggles on click; the named "Details for …" button is the keyboard and
 * screen-reader control. Inner controls that must not toggle (links, delete)
 * stop propagation themselves. Details mount only while expanded.
 */
export function DisclosureTableRow({ name, detailsId, expanded, onToggle, colSpan, details, children, rowRef }: {
  name: string
  detailsId: string
  expanded: boolean
  onToggle: () => void
  colSpan: number
  details: ReactNode
  /** Renders the summary row's cells; place `toggle` in the cell that names the record. */
  children: (toggle: ReactNode) => ReactNode
  rowRef?: Ref<HTMLTableRowElement>
}) {
  const toggle = (
    <Button variant="ghost" size="xs" aria-label={`Details for ${name}`} aria-expanded={expanded} aria-controls={detailsId}
      onClick={(event) => { event.stopPropagation(); onToggle() }}
      className="min-h-7 px-0 text-left font-medium hover:text-accent">
      {name}
    </Button>
  )
  return (
    <>
      <tr ref={rowRef} onClick={onToggle}
        className={cn('group cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/30', expanded && 'bg-secondary/20')}>
        {children(toggle)}
      </tr>
      <tr id={detailsId} hidden={!expanded}>
        {expanded && (
          <td colSpan={colSpan} className="border-b border-border/60 bg-secondary/10 px-4 py-4">
            {details}
          </td>
        )}
      </tr>
    </>
  )
}

/**
 * The mobile card for the same records: a named summary button that toggles a
 * detail region below. `aside` (status, delete) sits beside the button, never
 * inside it, so those controls keep their own touch targets.
 */
export function DisclosureCard({ name, detailsId, expanded, onToggle, title = name, subtitle, icon, aside, meta, children }: {
  name: string
  detailsId: string
  expanded: boolean
  onToggle: () => void
  /** Visible heading; defaults to `name`. */
  title?: ReactNode
  subtitle: ReactNode
  icon?: ReactNode
  aside?: ReactNode
  /** Summary content shown below the header while collapsed and expanded. */
  meta?: ReactNode
  /** Detail editor, mounted only while expanded. */
  children: ReactNode
}) {
  return (
    <div className="surface rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <Button variant="ghost" size="sm" aria-label={`Details for ${name}`} aria-expanded={expanded} aria-controls={detailsId}
          onClick={onToggle}
          className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2.5 p-0 text-left whitespace-normal">
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{title}</span>
            <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
          </span>
        </Button>
        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
      </div>
      {meta}
      <div id={detailsId} hidden={!expanded}>
        {expanded && <div className="mt-4 border-t border-border/60 pt-3">{children}</div>}
      </div>
    </div>
  )
}
