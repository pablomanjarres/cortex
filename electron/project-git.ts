import { execFileSync } from 'node:child_process'

export function readLatestCommit(dir: string): { message: string; date: string } | null {
  try {
    const log = execFileSync('git', ['-C', dir, 'log', '--oneline', '--format=%s|||%ci', '-1'], {
      timeout: 3000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!log) return null
    const [message, date] = log.split('|||')
    return { message: message || '', date: date?.slice(0, 10) || '' }
  } catch {
    return null
  }
}
