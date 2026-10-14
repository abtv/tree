import fc from 'fast-check'
import { expect, it } from 'vitest'
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
