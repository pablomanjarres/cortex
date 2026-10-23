import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatNumberDraft, parseNumberDraft, type NumberRule } from '@/lib/number-draft'

interface InlineNumberEditorProps {
  value: number | undefined
  rule: NumberRule
  /** Accessible name of the input; the trigger is named "Edit <label>". */
  label: string
  /** Read-only rendering of the current value inside the trigger. */
  children: ReactNode
  onCommit: (value: number | undefined) => void
  placeholder?: string
  className?: string
  inputClassName?: string
}

/**
 * Click-to-edit number for dense rows. Enter or blur saves a valid draft once,
 * Escape discards it, an invalid draft is flagged on Enter and discarded on blur,
 * and keyboard closes return focus to the trigger.
 */
export function InlineNumberEditor({ value, rule, label, children, onCommit, placeholder, className, inputClassName }: InlineNumberEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closed = useRef(false)
  const restoreFocus = useRef(false)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
    else if (restoreFocus.current) { restoreFocus.current = false; triggerRef.current?.focus() }
  }, [editing])

  const open = () => {
    closed.current = false
    setDraft(formatNumberDraft(value))
    setInvalid(false)
    setEditing(true)
  }

  const close = (keyboard: boolean) => {
    closed.current = true
    restoreFocus.current = keyboard
    setEditing(false)
  }

  /** Returns false when the draft is invalid (nothing is written). */
  const save = () => {
    const parsed = parseNumberDraft(draft, rule)
    if (!parsed.ok) return false
    if (parsed.value !== value) onCommit(parsed.value)
    return true
  }

  if (!editing) {
    return (
      <Button variant="ghost" size="xs" ref={triggerRef} type="button" onClick={open} aria-label={`Edit ${label.charAt(0).toLowerCase()}${label.slice(1)}`} className={cn('h-auto min-h-7 justify-end px-0 text-right font-mono font-normal tabular-nums', className)}>
        {children}
      </Button>
    )
  }

  return (
    <Input
      ref={inputRef}
      variant="inline"
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => { setDraft(e.target.value); setInvalid(false) }}
      onBlur={() => {
        if (closed.current) return
        save()
        close(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(true) }
        if (e.key === 'Enter') {
          e.preventDefault()
          if (save()) close(true)
          else setInvalid(true)
        }
      }}
      className={cn('w-12 text-right font-mono tabular-nums', inputClassName)}
    />
  )
}
