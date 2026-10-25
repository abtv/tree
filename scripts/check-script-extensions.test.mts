import { ESLint } from 'eslint'
import { expect, it } from 'vitest'

const eslint = new ESLint()
const source = 'export const value = 1\n'

it.each([
  'new-config.mjs',
  'scripts/nested/helper.mjs',
  'e2e/web/example.spec.mjs',
  'perf/web/example.spec.mjs',
  'nested/eslint.config.mjs',
  'scripts/web-release/nested/cli.mjs',
])('rejects an unapproved JavaScript module at %s', async (filePath) => {
  const [result] = await eslint.lintText(source, { filePath })
  expect(result!.messages).toEqual([
    expect.objectContaining({
      ruleId: 'no-restricted-syntax',
      severity: 2,
      message: expect.stringContaining('Use .mts'),
    }),
  ])
})

it('rejects an empty unapproved JavaScript module', async () => {
  const [result] = await eslint.lintText('', { filePath: 'scripts/empty.mjs' })
  expect(result!.messages).toEqual([expect.objectContaining({ ruleId: 'no-restricted-syntax', severity: 2 })])
})

it.each([
  'eslint.config.mjs',
  'config/testing/stryker.config.mjs',
  'scripts/web-release/cli.mjs',
  'scripts/web-release/publish.mjs',
  'scripts/web-release/verify-target.mjs',
  'scripts/nested/helper.mts',
  'e2e/web/example.spec.mts',
  'perf/web/example.spec.mts',
])('allows an approved exception or TypeScript module at %s', async (filePath) => {
  const [result] = await eslint.lintText(source, { filePath })
  expect(result!.messages).toEqual([])
})
