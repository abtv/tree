import { defineConfig } from '@playwright/test'

// Hidden runs execute spec files in parallel across workers, and selected long-running suites opt
// into test-level parallelism. Visible runs stay serial because they share the desktop and exist to
// observe the real UI. The global default remains file-parallel so `e2e/shortcut.spec.ts` keeps its
// real, machine-global `Cmd+0` tests on one worker; other parallel launches use the shortcut stub.
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
