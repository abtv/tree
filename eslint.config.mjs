// Keep JavaScript: ESLint's TypeScript config loader requires jiti or an unstable native-loading flag.
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
      message: 'Platform APIs belong outside the domain, application, and renderer layers.',
    })),
    {
      name: 'electron',
      message: 'Electron APIs must remain behind the main/preload process boundary.',
    },
  ],
}

export default tseslint.config(
  {
    ignores: [
      'coverage/**',
      'node_modules/**',
      'out/**',
      'reports/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      '.stryker-tmp/**',
      '.scratch/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs'],
    ignores: [
      // These tool configurations retain their existing JavaScript loaders/discovery.
      'eslint.config.mjs',
      'config/testing/stryker.config.mjs',
      // Installed release workflows still call these compatibility entry points.
      'scripts/web-release/cli.mjs',
      'scripts/web-release/publish.mjs',
      'scripts/web-release/verify-target.mjs',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'Use .mts instead of .mjs. A necessary tool or compatibility exception must be documented and explicitly listed in eslint.config.mjs.',
        },
      ],
    },
  },
  {
    files: [
      'config/build/*.ts',
      'eslint.config.mjs',
      'config/testing/vitest.config.ts',
      'config/testing/*.ts',
      'scripts/**/*.{js,mjs,ts,mts}',
      'e2e/**/*.{ts,mts,cjs,mjs}',
      'perf/**/*.{ts,mts,mjs}',
      'src/electron/main/**/*.ts',
      'src/electron/preload/**/*.ts',
      'src/infrastructure/main/**/*.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['e2e/web/**/*.{mts,mjs}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['e2e/**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['config/testing/playwright.config.ts', 'config/testing/perf.config.ts', 'e2e/**/*.ts', 'perf/**/*.ts'],
    rules: {
      'no-empty-pattern': 'off',
    },
  },
  {
    // ADR 0022: async fflate APIs start blob-URL workers that the browser CSP blocks, and fflate's
    // archive readers trust local headers or scan for signatures. Tests may use them as oracles.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts', 'src/**/*-test-utils.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'fflate',
              importNames: [
                'AsyncCompress',
                'AsyncDecompress',
                'AsyncDeflate',
                'AsyncGunzip',
                'AsyncGzip',
                'AsyncInflate',
                'AsyncUnzipInflate',
                'AsyncUnzlib',
                'AsyncZipDeflate',
                'AsyncZlib',
                'Unzip',
                'UnzipInflate',
                'UnzipPassThrough',
                'compress',
                'decompress',
                'deflate',
                'gunzip',
                'gzip',
                'inflate',
                'unzip',
                'unzipSync',
                'unzlib',
                'zip',
                'zlib',
              ],
              message: 'Use only synchronous fflate streams and the own archive reader (ADR 0022).',
            },
          ],
          patterns: [
            {
              group: ['fflate/*'],
              message: 'Import fflate only through its package entry so the restricted names apply (ADR 0022).',
            },
          ],
        },
      ],
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
    files: ['src/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...platformImportRestrictions,
          patterns: [
            {
              group: ['react', 'react/**', 'react-dom', 'react-dom/**', 'electron/**', 'fflate', 'fflate/**'],
              message: 'The application layer must remain independent of React, platform APIs and archive libraries.',
            },
          ],
        },
      ],
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
                'fflate',
                'fflate/**',
                '../application/**',
                '../infrastructure/**',
                '../electron/**',
                '../web/**',
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
