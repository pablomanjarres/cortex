import { useState, type ReactNode } from 'react'
import { ChevronDown, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface QuickAddItem {
  key: string
  label: string
  detail: string
  onAdd: () => void
  onRemove: () => void
  removeLabel: string
}

/**
 * Collapsible one-tap list with an edit mode: tapping an item adds it, and in
 * edit mode each item shows a remove action instead. `children` is the form
 * that saves new items; it shows whenever the panel is open.
 */
export function QuickAddPanel({ title, editLabel, doneLabel, items, children }: {
  title: ReactNode
  editLabel: string
  doneLabel: string
  items: QuickAddItem[]
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)

  return (
    <div className="surface space-y-3 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setOpen(!open)}
          className="h-11 whitespace-normal text-left text-base text-foreground"
          aria-expanded={open}
        >
          {title}
          <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
        {open && (
          <Button
            variant={editing ? 'secondary' : 'ghost'}
            size="icon-lg"
            onClick={() => setEditing(!editing)}
            aria-label={editing ? doneLabel : editLabel}
          >
            <Pencil />
          </Button>
        )}
      </div>

      {open && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-1.5">
            {items.map((item) => (
              <div key={item.key} className="group relative">
                <Button
                  variant="secondary"
                  onClick={() => !editing && item.onAdd()}
                  className={cn(
                    'h-auto min-h-14 w-full flex-col items-start gap-1 whitespace-normal rounded-md border border-border bg-muted/40 px-3 py-3 text-left text-sm',
                    editing ? 'cursor-default pr-12' : 'hover:bg-muted/70 active:bg-muted',
                  )}
                >
                  <span className="text-foreground">{item.label}</span>
                  <span className="ml-1 font-mono text-2xs tabular-nums text-foreground-faint">{item.detail}</span>
                </Button>
                {editing && (
                  <Button
                    variant="destructive"
                    size="icon-lg"
                    className="absolute right-0 top-0 h-11 w-11"
                    onClick={item.onRemove}
                    aria-label={item.removeLabel}
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {children}
        </>
      )}
    </div>
  )
}
