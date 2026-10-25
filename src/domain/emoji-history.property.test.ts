import { expect, it } from 'vitest'
import fc from 'fast-check'
import catalog from './emoji-catalog.json'
import { EMOJI_HISTORY_LIMIT, initialEmojiSuggestions, normalizeEmojiHistory } from './emoji-completion'

it('keeps a unique bounded MRU followed by every remaining shortcode in lexical order', () => {
  const names = Object.keys(catalog).toSorted()
  fc.assert(
    fc.property(fc.array(fc.constantFrom(...names), { maxLength: 250 }), (visits) => {
      const history = normalizeEmojiHistory(visits.toReversed())
      const expected = [...new Set(visits.toReversed())].slice(0, EMOJI_HISTORY_LIMIT)
      const initial = initialEmojiSuggestions(history).map(({ shortcode }) => shortcode)

      expect(history).toEqual(expected)
      expect(initial.slice(0, history.length)).toEqual(expected)
      expect(new Set(initial).size).toBe(names.length)
      expect(initial.slice(history.length)).toEqual(names.filter((name) => !history.includes(name)))
    }),
  )
})

it('ignores invalid history without accepting object prototype names', () => {
  expect(normalizeEmojiHistory(null)).toEqual([])
  expect(normalizeEmojiHistory(['constructor', '__proto__', 'cat', 1, 'cat'])).toEqual(['cat'])
})
