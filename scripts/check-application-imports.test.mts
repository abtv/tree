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

it.each([
  ['src/web/example.ts', '../electron/main/ipc-security'],
  ['src/web/nested/example.ts', '../../infrastructure/main/clipboard'],
  ['src/web/nested/example.test.ts', '../../electron/main/ipc-security'],
  ['src/shared/example.ts', '../electron/main/ipc-security'],
  ['src/shared/nested/example.ts', '../../infrastructure/main/clipboard'],
  ['src/web/example.tsx', 'node:fs/promises'],
  ['src/web/example.ts', 'fs'],
  ['src/shared/example.ts', 'electron'],
  ['src/web/example.ts', 'electron/main'],
])('rejects desktop imports in %s from %s', async (filePath, source) => {
  for (const statement of [`import '${source}'`, `export * from '${source}'`, `void import('${source}')`]) {
    const [result] = await eslint.lintText(statement, { filePath })

    expect(result!.messages).toContainEqual(expect.objectContaining({ ruleId: 'no-restricted-syntax', severity: 2 }))
  }
})

it.each(['../web/services', '../renderer/editor-dom', '../application/editor-store', 'react', 'fflate'])(
  'keeps shared parsers independent of %s',
  async (source) => {
    const [result] = await eslint.lintText(`export * from '${source}'`, { filePath: 'src/shared/example.ts' })

    expect(result!.messages).toContainEqual(expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 }))
  },
)

it('allows shared parsers in both platforms and keeps browser archive restrictions', async () => {
  for (const filePath of ['src/web/example.ts', 'src/electron/main/example.ts']) {
    const [result] = await eslint.lintText("export * from '../shared/clipboard-links'", { filePath })

    expect(result!.messages).toEqual([])
  }

  const [result] = await eslint.lintText("export { unzip } from 'fflate'", { filePath: 'src/web/example.ts' })

  expect(result!.messages).toContainEqual(expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 }))
})

it('preserves type-only application contracts in shared IPC declarations', async () => {
  const [result] = await eslint.lintText(
    "export type { NotesSummary } from '../application/notes-archive/export-notes'",
    { filePath: 'src/shared/example.ts' },
  )

  expect(result!.messages).toEqual([])
})
