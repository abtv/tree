import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['src/test/fast-check-setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**', 'perf/**/*.spec.ts', 'test-results/**'],
    css: { include: [/styles\.css/] },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        statements: 91,
        branches: 83,
        functions: 92,
        lines: 93,
        'src/domain/document-operations.ts': { branches: 80 },
        'src/application/editor-save-scheduler.ts': { branches: 80 },
        'src/application/editor-store.ts': { branches: 80 },
        'src/main/ipc-security.ts': {
          statements: 90,
          branches: 85,
          functions: 100,
          lines: 95,
        },
        'src/main/ipc-handlers.ts': {
          statements: 95,
          branches: 80,
          functions: 100,
          lines: 95,
        },
        'src/infrastructure/main/file-services.ts': {
          statements: 90,
          branches: 80,
          functions: 95,
          lines: 95,
        },
        // Renderer interaction-state owners: regression guards measured when the ownership refactor
        // completed, set just below measurement; restore coverage rather than lower a floor.
        'src/renderer/link-caret.ts': {
          statements: 99,
          branches: 99,
          functions: 99,
          lines: 99,
        },
        'src/renderer/vim-edit-session.ts': {
          statements: 99,
          branches: 99,
          functions: 99,
          lines: 99,
        },
        'src/renderer/vim-command-state.ts': {
          statements: 99,
          branches: 99,
          functions: 99,
          lines: 99,
        },
        'src/renderer/use-node-input-bindings.ts': {
          statements: 83.5,
          branches: 71.4,
          functions: 81.3,
          lines: 87.8,
        },
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/renderer/test/**',
        'src/application/test/**',
        'src/test/**',
        'src/main/index.ts',
        'src/renderer/main.tsx',
      ],
    },
  },
})
