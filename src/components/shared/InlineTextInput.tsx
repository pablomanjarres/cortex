import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

interface InlineTextInputProps {
  initialValue?: string
  /** Called once with the trimmed draft on Enter or blur (may be empty). */
  onCommit: (value: string) => void
  /** Called on Escape; the draft is discarded and blur does not commit. */
  onCancel: () => void
  'aria-label': string
  placeholder?: string
  className?: string
}

/**
 * Inline text draft for click-to-add / click-to-rename rows. Focuses on mount;
 * the owner decides when to mount it and what to write on commit.
 */
export function InlineTextInput({ initialValue = '', onCommit, onCancel, 'aria-label': ariaLabel, placeholder, className }: InlineTextInputProps) {
  const [draft, setDraft] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const closed = useRef(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  const commit = () => {
    if (closed.current) return
    closed.current = true
    onCommit(draft.trim())
  }

  return (
    <Input
      ref={inputRef}
      variant="inline"
      type="text"
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') {
          e.preventDefault()
          if (closed.current) return
          closed.current = true
          onCancel()
        }
      }}
      className={className}
    />
  )
}
