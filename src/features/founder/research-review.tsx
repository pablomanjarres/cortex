import type { ReactNode } from 'react'
import { Chip } from '@/components/ui/chip'

const APPROVED_STATUSES = new Set(['confirmed', 'accepted', 'approved'])

/** Approved review states read as success, rejections as danger, anything still open as warning. */
function reviewChipVariant(status: string): 'success' | 'danger' | 'warning' {
  if (APPROVED_STATUSES.has(status)) return 'success'
  return status === 'rejected' ? 'danger' : 'warning'
}

export function ReviewStatusChip({ status, children }: { status: string; children?: ReactNode }) {
  return <Chip variant={reviewChipVariant(status)}>{children ?? status}</Chip>
}
