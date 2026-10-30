// Keep JavaScript: Stryker's configuration loader supports .mjs, not .mts.
import process from 'node:process'
import { mutationShard } from './mutation-shards.mts'

// Mutation testing for the domain and application layers and the pure renderer modules. See docs/DEVELOPMENT.md §12.
const shard = mutationShard(process.env['TREE_MUTATION_SHARD'])

/** @satisfies {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: 'vitest',
  vitest: { configFile: 'config/testing/vitest.config.ts' },
  // Instrumentation measures mutated code, so submillisecond timing guards
  // run in ordinary Vitest validation instead of mutation workers. Agent scratch
  // directories can hold browser profiles with dangling links that the sandbox copy rejects.
  ignorePatterns: ['src/**/*.performance.test.ts', '.scratch'],
  coverageAnalysis: 'perTest',
  mutate: [
    'src/domain/**/*.ts',
    'src/application/**/*.ts',
    // Renderer modules with no React, DOM, or Electron imports; hooks and components stay out of scope.
    'src/renderer/vim-editing.ts',
    'src/renderer/vim-text-commands.ts',
    'src/renderer/vim-surround.ts',
    'src/renderer/vim-caret-transition.ts',
    'src/renderer/caret-projection-state.ts',
    'src/renderer/vim-vertical-navigation.ts',
    'src/renderer/vim-command-state.ts',
    'src/renderer/vim-edit-session.ts',
    'src/renderer/link-caret.ts',
    'src/renderer/drag-caret-freeze.ts',
    'src/renderer/node-drag.ts',
    'src/renderer/list-window.ts',
    'src/renderer/agenda-key-policy.ts',
    'src/renderer/agenda-drop-targets.ts',
    'src/renderer/completion-controller.ts',
    'src/renderer/completion-sources.ts',
    'src/renderer/shortcut-profile.ts',
    '!src/**/*.test.ts',
    '!src/application/test/**',
  ],
  reporters: ['clear-text', 'progress', 'html', 'json'],
  // The console shows only the score table; read surviving mutants in the HTML report.
  clearTextReporter: { reportTests: false, reportMutants: false },
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // The full-run score was 94.97% when this threshold was set; the margin absorbs timeout and random-seed noise.
  thresholds: { high: 95, low: 90, break: 93 },
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
}

// CI selects a layer from this same list, so adding a module cannot leave the scheduled run behind.
if (shard)
  config.mutate = config.mutate.filter((pattern) => pattern.startsWith('!') || pattern.startsWith(`src/${shard}/`))

export default config
