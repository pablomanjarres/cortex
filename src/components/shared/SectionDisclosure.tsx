import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SectionDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <section className="surface rounded-3xl p-4">
      <Button variant="ghost" className="h-12 w-full justify-between text-base text-foreground" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
        {title}<ChevronDown className={open ? 'rotate-180' : ''} />
      </Button>
      <div id={id} hidden={!open} className="pt-4">{children}</div>
    </section>
  )
}
