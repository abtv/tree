import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './perf/electron',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
})
