/** Focus sessions are durable history; other daily files keep the cache retention window. */
export function shouldDeleteDailyFile(file: string, now: number, retentionMs: number): boolean {
  if (!file.startsWith('cortex-daily-') || !file.endsWith('.json')) return false
  if (file.startsWith('cortex-daily-sessions-')) return false

  const dateStr = file.replace('.json', '').slice(-10)
  const fileTime = new Date(dateStr).getTime()
  return !Number.isNaN(fileTime) && now - fileTime > retentionMs
}
