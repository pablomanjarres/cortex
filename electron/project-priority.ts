/** Project priority uses 1 for the highest rank. Unranked projects sort last. */
export function projectPriorityRank(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 99
}
