import { defineConfig } from '@playwright/test'

const testPort = process.env.CORTEX_E2E_PORT || '3479'
const testOrigin = `http://127.0.0.1:${testPort}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: testOrigin,
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    serviceWorkers: 'block',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: testOrigin,
    reuseExistingServer: !process.env.CI,
  },
})
