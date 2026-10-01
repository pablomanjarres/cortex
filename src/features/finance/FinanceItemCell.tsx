import { useRef, useState } from 'react'
import { Check, Circle, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  kind: 'received' | 'paid'
  name: string
  onNameChange: (name: string) => void
  amount: number | null
  expected: number
  settled?: boolean
  concealed?: boolean
  formatAmount: (amount: number) => string
  onSave: (amount: number) => void
  onClear?: () => void
}

export function FinanceItemCell({ kind, name, onNameChange, amount, expected, settled, concealed, formatAmount, onSave, onClear }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelled = useRef(false)
  const active = expected > 0 && !concealed
  const complete = kind === 'received' ? amount !== null && amount >= expected : Boolean(settled)
  const partial = amount !== null && amount > 0

  const start = () => {
    cancelled.current = false
    setDraft(kind === 'received' ? (amount === null ? '' : String(amount)) : String(amount || expected))
    setEditing(true)
  }
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (kind === 'received' && draft === '') {
      if (amount !== null) onClear?.()
      setEditing(false)
      return
    }
    const value = Number(draft || '0')
    if (Number.isSafeInteger(value) && value >= 0) onSave(value)
    setEditing(false)
  }

  return (
    <div className="flex min-h-10 min-w-0 items-start gap-2">
      {active ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={start}
          disabled={editing}
          className="mt-0.5 shrink-0"
          aria-label={`Set ${kind} amount for ${name}`}
        >
          {complete ? (
            <span className="flex size-3.5 items-center justify-center rounded-full border border-success/25 bg-success/10">
              <Check className="size-2 text-success" strokeWidth={3} />
            </span>
          ) : partial ? (
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
        <input
          aria-label={`Item name for ${name}`}
          title={name}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          className="block h-5 min-w-0 w-full bg-transparent text-sm font-medium text-foreground outline-none focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
        />
        {active && (editing ? (
          <Input
            aria-label={`${kind === 'received' ? 'Received' : 'Paid'} amount for ${name}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                cancelled.current = true
                setEditing(false)
              }
            }}
            onBlur={commit}
            inputMode="numeric"
            maxLength={15}
            className="mt-1 h-7 w-full max-w-32 px-2 py-1 font-mono text-xs tabular-nums"
            autoFocus
          />
        ) : (
          <p className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs font-medium leading-4">
            <span className="text-muted-foreground">{kind === 'received' ? 'Received' : 'Paid'}</span>
            <span className={`font-mono tabular-nums ${complete ? 'text-success' : partial ? 'text-warning' : 'text-foreground/70'}`}>
              {amount === null ? '—' : formatAmount(amount)}/{formatAmount(expected)}
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}
