import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '../../e2e/smoke',
  testMatch: '*.spec.mts',
  outputDir: '../../test-results/smoke',
  workers: 1,
  retries: 0,
  timeout: 15_000,
  globalTimeout: 20_000,
  forbidOnly: true,
  reporter: 'list',
  use: { actionTimeout: 3000, navigationTimeout: 5000, trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'electron' }, { name: 'chromium' }],
})
