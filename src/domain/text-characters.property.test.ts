import { expect, it } from 'vitest'
import fc from 'fast-check'
import { characterBoundaries, characterStart, moveCharacterOffset } from './text-characters'

// @requirement PRODUCT.md §4.3
it('never leaves a character motion inside a grapheme and round trips complete characters', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('A', ' ', '🚀', '👩‍💻', '👍🏽', '🇬🇧', 'e\u0301'), { maxLength: 40 }),
      fc.nat(100),
      fc.integer({ min: 1, max: 100 }),
      (characters, offsetSeed, count) => {
        const text = characters.join('')
        const boundaries = characterBoundaries(text)
        const offset = offsetSeed % (text.length + 1)

        for (const direction of [-1, 1] as const) {
          expect(boundaries).toContain(moveCharacterOffset(text, offset, direction, count))
        }
        expect(boundaries).toContain(characterStart(text, offset))

        for (let index = 0; index < boundaries.length - 1; index++) {
          const start = boundaries[index]!

          const end = moveCharacterOffset(text, start, 1)

          expect(end).toBe(boundaries[index + 1])
          expect(moveCharacterOffset(text, end, -1)).toBe(start)
        }
      },
    ),
  )
})

// @requirement PRODUCT.md §4.3
it('preserves grapheme snapping and counted motion for arbitrary UTF-16 offsets', () => {
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('a', 'Ж', ' ', '\r', '\n', '\u0301', '👩‍💻', '👍🏽', '🇬🇧', '\ud83d', '\udc69'), {
        maxLength: 60,
      }),
      fc.integer({ min: -5, max: 400 }),
      fc.nat(100),
      (pieces, offset, count) => {
        const text = pieces.join('')
        const boundaries = [0, ...Array.from(segmenter.segment(text), ({ index, segment }) => index + segment.length)]
        const clamped = Math.max(0, Math.min(offset, Math.max(0, text.length - 1)))
        const snapped = boundaries.filter((boundary) => boundary <= offset).at(-1) ?? 0
        const forward = boundaries.filter((boundary) => boundary > offset)
        const backward = boundaries.filter((boundary) => boundary < offset).reverse()
        const destination = (positions: number[], fallback: number): number =>
          count === 0 ? snapped : (positions[Math.min(count - 1, positions.length - 1)] ?? fallback)

        expect(characterStart(text, offset)).toBe(boundaries.filter((boundary) => boundary <= clamped).at(-1) ?? 0)
        expect(moveCharacterOffset(text, offset, 1, count)).toBe(destination(forward, text.length))
        expect(moveCharacterOffset(text, offset, -1, count)).toBe(destination(backward, 0))
      },
    ),
  )
})
