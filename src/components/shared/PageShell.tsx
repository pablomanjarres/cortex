import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface PageShellProps {
  children: ReactNode
}

export function PageShell({ children }: PageShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col gap-6"
    >
      {children}
    </motion.div>
  )
}
