import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3479',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    serviceWorkers: 'block',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3479 --strictPort',
    url: 'http://127.0.0.1:3479',
    reuseExistingServer: !process.env.CI,
  },
})
