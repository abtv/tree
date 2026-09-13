import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'e2e/**', 'perf/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        statements: 91,
        branches: 83,
        functions: 92,
        lines: 93,
        'src/domain/document.ts': { branches: 80 },
        'src/application/editor-store.ts': { branches: 80 },
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
