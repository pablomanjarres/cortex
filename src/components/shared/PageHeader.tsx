import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  /** Optional context line above the title (e.g. a section/tab context) */
  kicker?: string
  /** Section title. Must NOT repeat the topbar page title. */
  title: string
  subtitle?: string
  /** Right-aligned actions slot (Buttons, Tabs, filter Chips) */
  actions?: ReactNode
  className?: string
}

/**
 * PageHeader — optional in-page header for tab sections and sub-views.
 * The routed page title already lives in the topbar (from routes.ts);
 * use this only for headers WITHIN a page, never to repeat the route title.
 */
export function PageHeader({ kicker, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {kicker && (
          <p className="mb-1 text-sm font-medium text-muted-foreground">
            {kicker}
          </p>
        )}
        <h2 className="text-2xl font-semibold leading-tight text-foreground md:text-3xl">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
