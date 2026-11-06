import { defineConfig } from '@playwright/test'
import regression from './playwright.config'

export default defineConfig({
  ...regression,
  workers: 1,
  retries: 0,
  testIgnore: [],
  projects: [
    { name: 'memory', testMatch: /shared-application-memory\.spec\.ts$/ },
    {
      name: 'memory-regressions',
      testDir: '../../perf/electron',
      testMatch: /(?:state|search|expansion|memory-detector)\.spec\.ts$/,
      grep: /@memory\b/,
      timeout: 120_000,
      expect: { timeout: 15_000 },
    },
  ],
})
