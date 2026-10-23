import { cloneElement, isValidElement, useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: string
  hint?: string
  className?: string
  children: (id: string) => ReactNode
}

/** A labelled control. The render function gives its input a unique label id. */
export function Field({ label, hint, className, children }: FieldProps) {
  const id = useId()
  const control = children(id)
  const describedControl = hint && isValidElement<Record<string, unknown>>(control)
    ? cloneElement(control, { 'aria-describedby': [control.props['aria-describedby'], `${id}-hint`].filter(Boolean).join(' ') })
    : control
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <label htmlFor={id} className="block text-xs text-muted-foreground">{label}</label>
      {describedControl}
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
