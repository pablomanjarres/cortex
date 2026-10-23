import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { textControlStyles } from './control-styles'

/** Multiline input sharing Input's surface and interaction states. */
export function Textarea({ className, variant = 'default', ...props }: ComponentProps<'textarea'> & { variant?: 'default' | 'inline' }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        textControlStyles,
        'min-h-24',
        variant === 'inline' && 'min-h-0 rounded-none border-0 bg-transparent shadow-none',
        className,
      )}
      {...props}
    />
  )
}
