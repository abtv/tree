import { configDefaults, defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// The domain performance guards measure sub-millisecond work without coverage. Sharing the
// parallel unit pool lets a scheduler pause in another worker inflate the timed result, so they run
// in their own local serial Vitest invocation (`npm run test:performance`) instead
// of the coverage-enabled unit run. Mutation workers exclude `*.performance.test.ts` for the same
// reason. See docs/DEVELOPMENT.md §12.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    environment: 'node',
    setupFiles: ['src/test/fast-check-setup.ts'],
    include: ['src/**/*.performance.test.ts'],
    exclude: [...configDefaults.exclude],
    fileParallelism: false,
  },
})
