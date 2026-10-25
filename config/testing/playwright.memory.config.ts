import { defineConfig } from '@playwright/test'
import regression from './playwright.config'

export default defineConfig({
  ...regression,
  testIgnore: [],
  projects: [{ name: 'memory', testMatch: /shared-application-memory\.spec\.ts$/ }],
})
