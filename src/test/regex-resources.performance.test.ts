import { expect, it } from 'vitest'
import { joinSiblingRange } from '../domain/document-operations'
import { findBrokenLinks } from '../../scripts/check-docs.mts'
import { productOwnText } from '../../scripts/product-sections.mts'
import { markdownLinks } from '../../scripts/markdown-links.mts'

// @requirement PRODUCT.md §22.1
// Keep the timing budget local; regex-resources.test.ts retains CI correctness and heap guards.
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
