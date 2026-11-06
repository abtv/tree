import { defineConfig } from '@playwright/test'
import regression from './playwright.config'

export default defineConfig({
  ...regression,
  workers: 1,
  retries: 0,
  testIgnore: [],
  projects: [{ name: 'memory', testMatch: /shared-application-memory\.spec\.ts$/ }],
})
