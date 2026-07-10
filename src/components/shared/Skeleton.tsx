import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Skeleton — the standard loading affordance (skeleton over spinner, always).
 * Shimmer sweep is motion-safe (disabled under prefers-reduced-motion).
 * Size it with className: <Skeleton className="h-4 w-32" />
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('skeleton rounded-md', className)} {...props} />
}
