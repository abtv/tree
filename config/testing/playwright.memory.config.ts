import { defineConfig } from '@playwright/test'
import regression from '../../playwright.config'

export default defineConfig({
  ...regression,
  testDir: '../../e2e/electron',
  globalSetup: '../../e2e/electron/global-setup.ts',
  outputDir: '../../test-results',
  testIgnore: [],
  projects: [{ name: 'memory', testMatch: /shared-application-memory\.spec\.ts$/ }],
})
