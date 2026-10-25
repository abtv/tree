import { ESLint } from 'eslint'
import { expect, it } from 'vitest'

const eslint = new ESLint()

it.each([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'electron',
  'electron/main',
  'fs',
  'fs/promises',
  'node:fs',
  'node:fs/promises',
  'node:path',
])('rejects application imports and re-exports of %s', async (source) => {
  for (const statement of [`import '${source}'`, `export * from '${source}'`]) {
    const [result] = await eslint.lintText(statement, { filePath: 'src/application/nested/example.ts' })

    expect(result!.messages).toEqual([expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 })])
  }
})

it.each(['src/application/example.tsx', 'src/application/example.test.ts'])('guards %s', async (filePath) => {
  const [result] = await eslint.lintText("import 'react'", { filePath })

  expect(result!.messages).toEqual([expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 })])
})

it('allows domain, application, and shared contracts', async () => {
  const [result] = await eslint.lintText(
    "export * from '../domain/document'\nexport * from './editor-store-types'\nexport * from '../shared/ipc'",
    { filePath: 'src/application/example.ts' },
  )

  expect(result!.messages).toEqual([])
})

it('keeps platform imports available to infrastructure', async () => {
  const [result] = await eslint.lintText("import 'node:fs/promises'", {
    filePath: 'src/infrastructure/main/example.ts',
  })

  expect(result!.messages).toEqual([])
})

it.each(['../electron/main/bootstrap', '../web/services'])(
  'keeps platform source %s out of the domain',
  async (source) => {
    const [result] = await eslint.lintText(`export * from '${source}'`, { filePath: 'src/domain/example.ts' })

    expect(result!.messages).toEqual([expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 })])
  },
)
