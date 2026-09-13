import js from '@eslint/js'
import { builtinModules } from 'node:module'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const nodeImports = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]

const platformImportRestrictions = {
  paths: [
    ...nodeImports.map((name) => ({
      name,
      message: 'Platform APIs belong outside the domain and renderer layers.',
    })),
    {
      name: 'electron',
      message: 'Electron APIs must remain behind the main/preload process boundary.',
    },
  ],
}

export default tseslint.config(
  {
    ignores: ['coverage/**', 'node_modules/**', 'out/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'electron.vite.config.ts',
      'eslint.config.mjs',
      'vitest.config.ts',
      'playwright.config.ts',
      'perf.config.ts',
      'scripts/**/*.{js,mjs,ts}',
      'e2e/**/*.{ts,cjs}',
      'perf/**/*.ts',
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'src/infrastructure/main/**/*.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['e2e/**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['playwright.config.ts', 'perf.config.ts', 'e2e/**/*.ts', 'perf/**/*.ts'],
    rules: {
      'no-empty-pattern': 'off',
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'src/infrastructure/renderer/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
      'no-restricted-imports': ['error', platformImportRestrictions],
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...platformImportRestrictions,
          patterns: [
            {
              group: [
                'react',
                'react/*',
                '../application/**',
                '../infrastructure/**',
                '../main/**',
                '../preload/**',
                '../renderer/**',
              ],
              message: 'The domain must not depend on UI, application orchestration, or infrastructure.',
            },
          ],
        },
      ],
    },
  },
)
