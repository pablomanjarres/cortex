import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface WidgetCardProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
  delay?: number
  variant?: 'default' | 'urgent' | 'success'
  compact?: boolean
}

export function WidgetCard({ title, description, children, className, delay = 0, variant = 'default', compact = false }: WidgetCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={cn(
        'rounded-xl',
        variant === 'default' && 'surface',
        compact ? 'p-4' : 'p-5',
        variant === 'urgent' && 'border border-red-500/40 bg-red-500/[0.06] shadow-[0_12px_28px_rgba(0,0,0,0.30),0_0_24px_rgba(239,68,68,0.10)]',
        variant === 'success' && 'border border-green-500/40 bg-green-500/[0.06] shadow-[0_12px_28px_rgba(0,0,0,0.30),0_0_24px_rgba(34,197,94,0.10)]',
        className
      )}
    >
      <div className={compact ? 'mb-2' : 'mb-4'}>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </motion.div>
  )
}
