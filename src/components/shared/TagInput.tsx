import { useRef, useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { parseTags } from '@/lib/tags'

type TagInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string[]
  onChange: (tags: string[]) => void
  label?: string
}

/** Keep the comma-separated draft intact until the user finishes the edit. */
export function TagInput({ value, onChange, label, onKeyDown, onBlur, ...props }: TagInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)

  return (
    <Input
      {...props}
      aria-label={label ?? props['aria-label']}
      value={draft ?? value.join(', ')}
      onChange={event => setDraft(event.target.value)}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault()
          cancelled.current = event.key === 'Escape'
          event.currentTarget.blur()
        }
      }}
      onBlur={event => {
        if (!cancelled.current && draft !== null) {
          const tags = parseTags(draft)
          if (tags.length !== value.length || tags.some((tag, index) => tag !== value[index])) onChange(tags)
        }
        cancelled.current = false
        setDraft(null)
        onBlur?.(event)
      }}
    />
  )
}
