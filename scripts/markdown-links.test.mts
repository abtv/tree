import { expect, it } from 'vitest'
import fc from 'fast-check'
import { markdownLinks } from './markdown-links.mts'
import { productOwnText, stripProductComments } from './product-sections.mts'

it('preserves simple link scanning, including nested opening brackets and malformed targets', () => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom('[', ']', '(', ')', '.md', '#', 'a', '\n'), { maxLength: 100 }), (parts) => {
      const text = parts.join('')
      const expected = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1])
      const plans = [...text.matchAll(/\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]*)?\)/gu)].map((match) => match[1])

      expect([...markdownLinks(text)].map((link) => link.target)).toEqual(expected)
      expect([...markdownLinks(text, true)].map((link) => link.target.split('#', 1)[0])).toEqual(plans)
    }),
    { numRuns: 2000 },
  )
})

it('preserves own-text counting across separators, blank lines and Unicode whitespace', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('---', 'x', ' ', '\t', '\n', '\r', '\u2028', '\u2029', '\u00a0'), { maxLength: 80 }),
      (parts) => {
        const text = parts.join('')

        expect(productOwnText([{ number: 1, text }])).toBe(
          stripProductComments(text)
            .replace(/^\s*---\s*$/gm, '')
            .trim(),
        )
      },
    ),
    { numRuns: 2000 },
  )
})
