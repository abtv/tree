import { defineConfig } from '@playwright/test'

// Hidden runs execute spec files in parallel across workers, and selected long-running suites opt
// into test-level parallelism. Visible runs stay serial because they share the desktop and exist to
// observe the real UI. The global default remains file-parallel so `e2e/shortcut.spec.ts` keeps its
// real, machine-global `Cmd+0` tests on one worker; other parallel launches use the shortcut stub.
const hiddenParallelRun = process.env['TREE_E2E_VISIBLE'] !== '1'

// The Vim end-to-end suite is split across three files that share the snapshot directory created
// for the original e2e/vim-editing.spec.ts. A project-scoped snapshotPathTemplate keeps those
// baselines in place without moving them or changing every other spec's snapshot directory.
const vimSpecFile = /vim-(?:image-caret|text-editing|navigation-and-visual)\.spec\.ts$/

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: hiddenParallelRun ? (process.env['CI'] ? 4 : 6) : 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  projects: [
    {
      // Every other spec keeps the default per-file snapshot directory.
      testIgnore: vimSpecFile,
    },
    {
      name: 'vim',
      testMatch: vimSpecFile,
      // The directory name is historical (it named the pre-split spec) and is kept so the 32
      // baselines stay byte-identical. `{-projectName}` is deliberately absent because this
      // project is named.
      snapshotPathTemplate: '{snapshotDir}/{testFileDir}/vim-editing.spec.ts-snapshots/{arg}{-snapshotSuffix}{ext}',
    },
  ],
  use: {
    trace: 'retain-on-failure',
  },
})
