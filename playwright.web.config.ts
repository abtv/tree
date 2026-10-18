import { defineConfig } from '@playwright/test'

const built = process.env['TREE_WEB_BUILT'] === '1'
const externalURL = process.env['TREE_WEB_URL']
const baseURL = externalURL ?? `http://127.0.0.1:${built ? 5175 : 5174}/`
// Google Chrome has no Linux arm64 build, so Linux uses Playwright's Chromium in new headless mode.
const channel = process.platform === 'darwin' ? 'chrome' : 'chromium'

export default defineConfig({
  testDir: './e2e/web',
  testMatch: '**/*.spec.mjs',
  outputDir: 'test-results/web',
  fullyParallel: false,
  // Restart and clipboard scenarios remain serial, matching the previous runner.
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/web', open: 'never' }]],
  projects: [{ name: built ? 'chrome-built' : 'chrome', use: { channel } }],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1100, height: 760 },
    colorScheme: 'light',
    actionTimeout: 12_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  ...(!externalURL && {
    webServer: {
      command: built ? 'npm run preview:web' : 'npm run dev:web',
      url: baseURL,
      reuseExistingServer: !process.env['CI'] && !built,
      timeout: 60_000,
    },
  }),
})
