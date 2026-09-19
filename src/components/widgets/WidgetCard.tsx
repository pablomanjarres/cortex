import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface WidgetCardProps {
  id?: string
  title: string
  description?: string
  children: ReactNode
  className?: string
  /** Stagger delay in seconds — capped at 0.06s total */
  delay?: number
  variant?: 'default' | 'urgent' | 'success'
  compact?: boolean
}

/** Total entrance stagger never exceeds this (seconds). */
const MAX_STAGGER = 0.06

/** WidgetCard — the standard dashboard panel. */
export function WidgetCard({
  id,
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
      id={id}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, delay: reduceMotion ? 0 : Math.min(delay, MAX_STAGGER), ease: 'easeOut' }}
      className={cn(
        'surface rounded-xl',
        compact ? 'p-4' : 'p-5',
        variant === 'urgent' && 'glow-danger',
        variant === 'success' && 'glow-success',
        className
      )}
    >
      <div className={compact ? 'mb-2' : 'mb-3'}>
        <h3 className="text-base font-semibold leading-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </motion.div>
  )
}
