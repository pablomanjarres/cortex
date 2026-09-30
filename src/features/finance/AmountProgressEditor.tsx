import { useRef, useState } from 'react'
import { Check, Circle, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  kind: 'received' | 'paid'
  name: string
  amount: number | null
  expected: number
  settled?: boolean
  formatAmount: (amount: number) => string
  onSave: (amount: number) => void
}

export function AmountProgressEditor({ kind, name, amount, expected, settled, formatAmount, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelled = useRef(false)
  const complete = kind === 'received' ? amount !== null && amount >= expected : Boolean(settled)
  const partial = amount !== null && amount > 0
  const showProgress = kind === 'received' ? amount !== null : partial && amount < expected

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
    const value = Number(draft || '0')
    if (Number.isSafeInteger(value) && value >= 0) onSave(value)
    setEditing(false)
  }

  if (editing) return (
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
      className="h-7 w-24 border-0 bg-input px-1 py-0 font-mono text-xs tabular-nums shadow-none"
      autoFocus
    />
  )

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={start}
        className="shrink-0"
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
          <Circle className="size-3.5 text-foreground-faint" />
        )}
      </Button>
      {showProgress && (
        <span className={`whitespace-nowrap font-mono text-3xs tabular-nums ${complete ? 'text-success' : 'text-warning'}`}>
          {formatAmount(amount!)}/{formatAmount(expected)}
        </span>
      )}
      {kind === 'received' && amount === null && (
        <span className="whitespace-nowrap text-3xs text-foreground-faint">Set received</span>
      )}
    </div>
  )
}
