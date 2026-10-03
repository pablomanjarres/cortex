import type { ComponentProps, ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function CardField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
    <span>{label}</span>{children}
    {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
  </label>
}
export function CardInput({ label, hint, ...props }: ComponentProps<typeof Input> & { label: string; hint?: string }) {
  return <CardField label={label} hint={hint}><Input {...props} /></CardField>
}
export function CardSelect({ label, children, ...props }: ComponentProps<'select'> & { label: string }) {
  return <CardField label={label}><select {...props} className="h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-ring">{children}</select></CardField>
}
export function CardFormActions({ pending, label = 'Save changes' }: { pending: boolean; label?: string }) {
  return <div className="flex justify-end pt-2"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : label}</Button></div>
}
