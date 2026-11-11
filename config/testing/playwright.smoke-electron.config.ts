import { defineConfig } from '@playwright/test'
import smoke from './playwright.smoke.config'

export default defineConfig({
  ...smoke,
  // Hosted macOS startup and restart need more time than the Linux/browser smoke.
  ...(process.platform === 'darwin' ? { timeout: 45_000, globalTimeout: 60_000 } : {}),
  projects: [{ name: 'electron' }],
})
