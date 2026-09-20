import { defineConfig } from '@playwright/test'

// Hidden runs execute spec files in parallel across workers. Visible runs stay serial because they
// share the desktop and exist to observe the real UI. Completely parallel test execution is avoided
// so each spec file stays on one worker: `e2e/shortcut.spec.ts` needs the real, machine-global
// `Cmd+0` registration, while every other parallel launch uses the test-owned shortcut stub.
const hiddenParallelRun = process.env['TREE_E2E_VISIBLE'] !== '1'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: hiddenParallelRun ? 5 : 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
})
