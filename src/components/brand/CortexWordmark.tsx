import { createElement } from 'react'

export function CortexWordmark() {
  return createElement(
    'div',
    {
      role: 'img',
      'aria-label': 'Cortex',
      className: 'flex items-center gap-2',
    },
    createElement('span', {
      'aria-hidden': true,
      className: 'block size-8 shrink-0 bg-sidebar-primary',
      style: {
        maskImage: 'url("./brand/mark.svg")',
        maskSize: 'contain',
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
      },
    }),
    createElement('span', {
      'aria-hidden': true,
      className: 'block h-7 w-28 shrink-0 bg-sidebar-primary',
      style: {
        maskImage: 'url("./brand/wordmark.svg")',
        maskSize: 'contain',
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
      },
    }),
  )
}
