import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { inlineControlStyles, textControlStyles } from './control-styles'

type SelectProps = ComponentProps<'select'> & { variant?: 'default' | 'inline' }

/** Native selection with the same focus, validation, and surface as Input. */
export function Select({ className, variant = 'default', ...props }: SelectProps) {
  return (
    <select
      data-slot="select"
      className={cn(
        textControlStyles,
        'h-10 py-0',
        variant === 'inline' && inlineControlStyles,
        className,
      )}
      {...props}
    />
  )
}
