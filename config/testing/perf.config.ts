import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '../..',
  testMatch: '**/*.spec.ts',
  outputDir: '../../test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  projects: [
    { name: 'electron', testDir: '../../perf/electron' },
    {
      // Browser scenarios run against the built static package (`npm run build:web`).
      name: 'web',
      testDir: '../../perf/web',
      testMatch: '**/*.spec.mts',
      // Google Chrome has no Linux arm64 build; match the browser E2E configuration.
      use: { channel: process.platform === 'darwin' ? 'chrome' : 'chromium', headless: false },
    },
  ],
})
