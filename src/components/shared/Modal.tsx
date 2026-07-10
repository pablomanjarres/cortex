import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Serif italic modal title */
  title?: string
  description?: string
  /** sm = forms/confirms, lg = editors/detail views, full = lightboxes/PDF viewers */
  size?: 'sm' | 'lg' | 'full'
  children: ReactNode
  /** Optional footer slot (Buttons) */
  footer?: ReactNode
  showCloseButton?: boolean
  className?: string
}

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  lg: 'sm:max-w-2xl',
  full: 'sm:max-w-[calc(100vw-3rem)] h-[calc(100vh-3rem)] grid-rows-[auto_1fr_auto]',
}

/**
 * Modal — the ONLY app modal/lightbox/viewer wrapper. Hand-rolled
 * fixed-inset overlays are banned. One z-scale (z-50), one scrim
 * (bg-black/70 + blur), one panel (.surface-strong via ui/dialog).
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = 'sm',
  children,
  footer,
  showCloseButton = true,
  className,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn(sizeClasses[size], className)}
      >
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        <div className={cn(size === 'full' && 'min-h-0 overflow-y-auto')}>{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
