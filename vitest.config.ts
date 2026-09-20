import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
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
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/renderer/test/**',
        'src/main/index.ts',
        'src/renderer/main.tsx',
      ],
    },
  },
})
