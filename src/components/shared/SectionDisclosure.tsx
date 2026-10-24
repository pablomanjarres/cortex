import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** `panel` is a standalone surface section; `inline` is a divider-topped row inside a card. */
type DisclosureVariant = 'panel' | 'inline'

const CHROME: Record<DisclosureVariant, { root: string; size?: 'sm'; button: string; region: string }> = {
  panel: { root: 'surface rounded-3xl p-4', button: 'h-12 w-full justify-between text-base text-foreground', region: 'pt-4' },
  inline: { root: 'border-t border-border/50 pt-2', size: 'sm', button: 'w-full justify-between px-1 text-muted-foreground', region: 'mt-2' },
}

/** A titled section, collapsed by default, that expands its children in place. */
export function SectionDisclosure({ title, variant = 'panel', children }: { title: string; variant?: DisclosureVariant; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const chrome = CHROME[variant]
  const Root = variant === 'panel' ? 'section' : 'div'
  return (
    <Root className={chrome.root}>
      <Button variant="ghost" size={chrome.size} className={chrome.button} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
        {title}<ChevronDown className={open ? 'rotate-180' : ''} />
      </Button>
      <div id={id} hidden={!open} className={chrome.region}>{children}</div>
    </Root>
  )
}
