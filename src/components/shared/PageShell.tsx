import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

interface PageShellProps {
  children: ReactNode
}

/**
 * PageShell — wraps every routed page. Fade-up entrance (12px / 0.4s),
 * vertical rhythm gap-6. Respects prefers-reduced-motion.
 */
export function PageShell({ children }: PageShellProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col gap-6"
    >
      {children}
    </motion.div>
  )
}
