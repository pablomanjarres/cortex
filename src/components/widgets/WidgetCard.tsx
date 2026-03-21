import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface WidgetCardProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
  delay?: number
}

export function WidgetCard({ title, description, children, className, delay = 0 }: WidgetCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={cn(
        'rounded-xl border border-border bg-card p-5',
        className
      )}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </motion.div>
  )
}
