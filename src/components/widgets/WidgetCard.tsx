import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface WidgetCardProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
  /** Stagger delay in seconds — capped at 0.45s total */
  delay?: number
  variant?: 'default' | 'urgent' | 'success'
  compact?: boolean
}

/** Total entrance stagger never exceeds this (seconds). */
const MAX_STAGGER = 0.45

/**
 * WidgetCard — the standard dashboard panel. Title is forced to the
 * mono-uppercase card-title style via CSS, so caller casing never matters.
 * urgent/success variants use the semantic hairline + soft glow classes.
 */
export function WidgetCard({
  title,
  description,
  children,
  className,
  delay = 0,
  variant = 'default',
  compact = false,
}: WidgetCardProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(delay, MAX_STAGGER), ease: 'easeOut' }}
      className={cn(
        'surface rounded-xl',
        compact ? 'p-3' : 'p-4',
        variant === 'urgent' && 'glow-danger',
        variant === 'success' && 'glow-success',
        className
      )}
    >
      <div className={compact ? 'mb-2' : 'mb-3'}>
        <h3 className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs text-foreground-faint">{description}</p>
        )}
      </div>
      {children}
    </motion.div>
  )
}
