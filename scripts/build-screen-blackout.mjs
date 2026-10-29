import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
if (process.platform === 'darwin') {
  mkdirSync('build/helpers', { recursive: true })
  execFileSync('xcrun', ['swiftc', '-O', '-framework', 'AppKit', '-framework', 'CoreGraphics', 'scripts/screen-blackout-mac.swift', '-o', 'build/helpers/cortex-blackout'], { stdio: 'inherit' })
}
