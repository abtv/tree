import { expect, it } from 'vitest'
import { characterBoundaries, characterStart, moveCharacterOffset } from './text-characters'

// @requirement PRODUCT.md §4.3
it.each(['🚀', '👩‍💻', '👍🏽', '🇬🇧', 'e\u0301'])(
  'steps over the complete visible character %s in either direction',
  (character) => {
    const text = `A${character}Z`

    expect(characterBoundaries(text)).toEqual([0, 1, 1 + character.length, text.length])
    expect(moveCharacterOffset(text, 1, 1)).toBe(1 + character.length)
    expect(moveCharacterOffset(text, 1 + character.length, -1)).toBe(1)
    expect(moveCharacterOffset(text, 0, 1, 2)).toBe(1 + character.length)
    for (let offset = 1; offset <= character.length; offset++) expect(characterStart(text, offset)).toBe(1)
    expect(moveCharacterOffset(text, text.length, 1, 999)).toBe(text.length)
    expect(moveCharacterOffset(text, 0, -1, 999)).toBe(0)
  },
)

// @requirement PRODUCT.md §22.1
it('reuses only the latest text boundaries and handles empty text', () => {
  const boundaries = characterBoundaries('A🚀Z')

  expect(characterBoundaries('A🚀Z')).toBe(boundaries)
  expect(characterBoundaries('')).toEqual([0])
  expect(characterBoundaries('A🚀Z')).not.toBe(boundaries)
  expect(characterStart('', 99)).toBe(0)
  expect(moveCharacterOffset('', 0, 1)).toBe(0)
  expect(moveCharacterOffset('A🚀Z', 2, 1, 0)).toBe(1)
})
