import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { joinSiblingRange } from '../domain/document-operations'
import { findBrokenLinks } from '../../scripts/check-docs.mts'
import { productOwnText } from '../../scripts/product-sections.mts'
import { markdownLinks } from '../../scripts/markdown-links.mts'

// @requirement PRODUCT.md §22.1
it('bounds work for internal whitespace and malformed Markdown', () => {
  const text = `a${' '.repeat(80_000)}b`
  const document = {
    roots: [
      { id: 'a', text, children: [] },
      { id: 'b', text: 'next', children: [] },
    ],
  }
  const start = performance.now()

  const joined = joinSiblingRange(document, 'a', 2, true)
  expect(joined.kind).toBe('joined')
  if (joined.kind === 'joined') expect(joined.document.roots[0]!.text).toBe(`${text} next`)
  findBrokenLinks({ content: '['.repeat(80_000), filePath: '/synthetic.md' })
  expect([...markdownLinks('['.repeat(80_000), true)]).toEqual([])
  expect([...markdownLinks(`${'[a]('.repeat(20_000)}bad)`, true)]).toEqual([])
  expect(productOwnText([{ number: 1, text: `${'\n'.repeat(80_000)}x` }])).toBe('x')

  expect(performance.now() - start).toBeLessThan(500)
})

// The 96 MiB old-generation limit is a regression budget, not an RSS cap. Each
// original implementation exhausted it; streaming/bounded recognition fits it.
it.each(['links', 'number', 'date'])(
  'fits the %s workload in a bounded heap',
  (scenario) => {
    const output = execFileSync(
      process.execPath,
      ['--max-old-space-size=96', 'scripts/regex-resource-probe.mts', scenario],
      {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 100_000,
      },
    )

    expect(output).toContain(`Completed ${scenario}`)
  },
  35_000,
)
