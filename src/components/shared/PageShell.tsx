import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

interface PageShellProps {
  children: ReactNode
}

/**
 * PageShell — wraps every routed page. Short fade-up entrance (6px / 0.2s),
 * vertical rhythm gap-6. Respects prefers-reduced-motion.
 */
export function PageShell({ children }: PageShellProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
      className="flex flex-col gap-6"
    >
      {children}
    </motion.div>
  )
}
