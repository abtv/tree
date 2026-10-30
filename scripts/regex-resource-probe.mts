// Run in a fresh, heap-limited process: a successful result proves the workload fits the budget.
import { readFileSync } from 'node:fs'
import { createRequire, type Module } from 'node:module'
import ts from 'typescript'

const loadModule = createRequire(import.meta.url)
loadModule.extensions['.ts'] = (module, filename) => {
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const compiled = module as Module & { _compile(source: string, filename: string): void }
  compiled._compile(source, filename)
}

const scenario = process.argv[2]
if (scenario === 'links') {
  const { reconcileLinkTextEdit } = loadModule(
    '../src/domain/document-links.ts',
  ) as typeof import('../src/domain/document-links')
  const text = 'https://example.test'
  const next = `https://${'x '.repeat(1_000_000)}example.test`
  const result = reconcileLinkTextEdit(text, [{ start: 0, end: text.length, url: text }], next)
  if (result.links.length !== 1 || result.links[0]?.url !== 'https://x') throw new Error('Wrong links')
} else if (scenario === 'number') {
  const { changeVimNumber } = loadModule('../src/domain/vim-number.ts') as typeof import('../src/domain/vim-number')
  const text = `0x${'A'.repeat(8_000_000)}`
  const result = changeVimNumber(text, 0, 1)
  if (result?.inserted.length !== text.length || !result.inserted.endsWith('FFFFFFFFFFFFFFFF')) {
    throw new Error('Wrong number')
  }
} else if (scenario === 'date') {
  const { suggestDates } = loadModule('../src/domain/natural-date.ts') as typeof import('../src/domain/natural-date')
  const text = `in ${'one-'.repeat(2_000_000)}one days`
  if (suggestDates(text, 0, 20_000) !== undefined) throw new Error('Wrong date')
} else {
  throw new Error('Unknown resource scenario')
}
console.log(`Completed ${scenario}`)
