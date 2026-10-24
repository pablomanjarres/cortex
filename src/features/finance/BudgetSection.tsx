import type { ReactNode } from 'react'

export function BudgetSection({ title, columnCount, children }: { title: string; columnCount: number; children: ReactNode }) {
  return <tbody aria-label={title}>
    <tr className="border-y border-border/40 bg-secondary/20">
      <th scope="rowgroup" colSpan={columnCount} className="px-4 py-2 text-left font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="sticky left-4 z-10 inline-block">{title}</span>
      </th>
    </tr>
    {children}
  </tbody>
}
