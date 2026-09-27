import { createElement } from 'react'

export function CortexWordmark() {
  return createElement(
    'span',
    {
      role: 'img',
      'aria-label': 'Cortex',
      className: 'block h-11 w-44 shrink-0 bg-sidebar-primary',
      style: {
        maskImage: 'url("./brand/wordmark.svg")',
        maskSize: 'contain',
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
      },
    },
  )
}
