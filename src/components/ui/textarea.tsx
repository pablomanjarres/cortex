import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { textControlStyles } from './control-styles'

/** Multiline input sharing Input's surface and interaction states. */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        textControlStyles,
        'min-h-24',
        className,
      )}
      {...props}
    />
  )
}
