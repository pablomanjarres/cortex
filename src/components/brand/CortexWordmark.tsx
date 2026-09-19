import { createElement } from 'react'

export function CortexWordmark() {
  return createElement(
    'div',
    { className: 'flex items-center gap-3' },
    createElement('img', {
      src: './icons/icon-192.png',
      alt: '',
      width: 40,
      height: 40,
      className: 'size-10 shrink-0 rounded-xl ring-1 ring-sidebar-border/70',
    }),
    createElement('span', { className: 'text-2xl font-bold tracking-tight text-sidebar-foreground' }, 'Cortex'),
  )
}
