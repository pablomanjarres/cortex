// Pure gallery/lightbox stepping shared by the image viewers.

export interface Point { x: number; y: number }

/** Step through `count` images, wrapping at either end. */
export const stepIndex = (index: number, delta: number, count: number) =>
  count > 0 ? (((index + delta) % count) + count) % count : 0

/** -1/+1 for a horizontal swipe past 40px, 0 for taps and vertical scrolls. */
export function swipeStep(start: Point | null, end: Point): number {
  if (!start) return 0
  const dx = end.x - start.x
  const dy = end.y - start.y
  return Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : -1) : 0
}
