import fc from 'fast-check'
import { expect, it } from 'vitest'
import { lowercaseTypedMarkerText, TAG_PREFIXES } from './tags'

// @requirement PRODUCT.md §20.13
it('preserves all text outside the typed range and normalizes ASCII marker typing idempotently', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 100 }),
      fc.constantFrom(...TAG_PREFIXES),
      fc.array(fc.constantFrom('A', 'Z', 'W', 'a', 'z', '0', '_', '-'), { maxLength: 30 }),
      fc.string({ maxLength: 100 }),
      (before, prefix, letters, after) => {
        const head = `${before} ${prefix}Old`
        const typed = letters.join('')
        const text = `${head}${typed}Name ${after}`
        const end = head.length + typed.length

        const result = lowercaseTypedMarkerText(text, head.length, end)

        expect(result).toBe(`${head}${typed.toLowerCase()}Name ${after}`)
        expect(lowercaseTypedMarkerText(result, head.length, end)).toBe(result)
      },
    ),
  )
})
