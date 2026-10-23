/** Shared surface and interaction states for text and native selection controls. */
export const textControlStyles = [
  'w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-[0_1px_2px_rgba(26,31,44,0.04)] transition-colors duration-150 outline-none',
  'placeholder:text-muted-foreground',
  'focus-visible:border-ring/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:border-destructive/50 aria-invalid:focus-visible:outline-destructive',
].join(' ')

/** Quiet edits inside rows retain the same focus and validation behavior. */
export const inlineControlStyles = 'h-auto rounded-none border-0 border-b border-border/60 bg-transparent px-0 py-1 text-xs shadow-none'
