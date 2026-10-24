import { useId, type ReactNode } from 'react'

interface SetupStateProps {
  icon: ReactNode
  title: string
  description: string
  /** Heading of the source status list. */
  statusTitle: string
  /** `SetupStatusRow`s, one per data source. */
  children: ReactNode
  footer?: ReactNode
}

/** First-run panel: what to connect, why it is empty, and each source's status. */
export function SetupState({ icon, title, description, statusTitle, children, footer }: SetupStateProps) {
  const titleId = useId()
  return (
    <section className="surface grid gap-6 rounded-xl p-5 sm:p-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" aria-labelledby={titleId}>
      <div className="flex flex-col justify-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-xl bg-focus-surface text-accent [&>svg]:size-6" aria-hidden>
          {icon}
        </span>
        <div className="space-y-2">
          <h2 id={titleId} className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="rounded-xl bg-secondary/40 p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{statusTitle}</h3>
        <div className="divide-y divide-border/60">{children}</div>
        {footer && <p className="mt-4 border-t border-border/60 pt-3 font-mono text-xs text-muted-foreground">{footer}</p>}
      </div>
    </section>
  )
}

export function SetupStatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
      <span className="text-foreground">{label}</span>
      <span className="shrink-0 text-muted-foreground">{children}</span>
    </div>
  )
}
