import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, Circle, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Settlement } from './finance-model'

interface Props {
  name: string
  settlement: Settlement
  concealed?: boolean
  formatAmount: (amount: number) => string
  /** `null` clears an income receipt back to unknown. */
  onSave: (amount: number | null) => void
  /** The row's own content, shown above the amount status or editor. */
  children: ReactNode
}

const statusTone = { complete: 'text-success', partial: 'text-warning', open: 'text-foreground/70' } as const

/**
 * One owner for paid expenses and received income: the status trigger, the amount editor, and the
 * settled-of-planned readout. Key it by record and month so an open draft never follows a switch.
 */
export function SettlementControl({ name, settlement, concealed, formatAmount, onSave, children }: Props) {
  const { kind, amount, expected, status } = settlement
  const editorId = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const closing = useRef(false)
  const returnFocus = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const editing = draft !== null
  const active = expected > 0 && !concealed
  const label = kind === 'received' ? 'Received' : 'Paid'

  useEffect(() => {
    if (editing || !returnFocus.current) return
    returnFocus.current = false
    triggerRef.current?.focus()
  }, [editing])

  const open = () => {
    closing.current = false
    setDraft(kind === 'received' ? (amount === null ? '' : String(amount)) : String(amount || expected))
  }
  const close = (save: boolean, refocus: boolean) => {
    if (closing.current || draft === null) return
    closing.current = true
    returnFocus.current = refocus
    setDraft(null)
    if (!save) return
    const next = kind === 'received' && draft === '' ? null : Number(draft || '0')
    if (next !== null && !Number.isSafeInteger(next)) return
    if (next !== amount) onSave(next)
  }

  return (
    <div className="flex min-h-10 min-w-0 items-start gap-2">
      {active ? (
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={open}
          disabled={editing}
          aria-expanded={editing}
          aria-controls={editing ? editorId : undefined}
          className="mt-0.5 shrink-0"
          aria-label={`Set ${kind} amount for ${name}`}
        >
          {status === 'complete' ? (
            <span className="flex size-3.5 items-center justify-center rounded-full border border-success/25 bg-success/10">
              <Check className="size-2 text-success" strokeWidth={3} />
            </span>
          ) : status === 'partial' ? (
            <span className="flex size-3.5 items-center justify-center rounded-full border border-warning/25 bg-warning/10">
              <DollarSign className="size-2 text-warning" strokeWidth={3} />
            </span>
          ) : (
            <Circle className="size-3.5 text-muted-foreground" />
          )}
        </Button>
      ) : (
        <span className="block size-7 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        {children}
        {active && (editing ? (
          <Input
            id={editorId}
            aria-label={`${label} amount for ${name}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== 'Escape') return
              event.preventDefault()
              close(event.key === 'Enter', true)
            }}
            onBlur={() => close(true, false)}
            inputMode="numeric"
            maxLength={15}
            className="mt-1 h-7 w-full max-w-32 px-2 py-1 font-mono text-xs tabular-nums"
            autoFocus
          />
        ) : (
          <p className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs font-medium leading-4">
            <span className="text-muted-foreground">{label}</span>
            <span className={`font-mono tabular-nums ${statusTone[status]}`}>
              {amount === null ? '—' : formatAmount(amount)}/{formatAmount(expected)}
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}
