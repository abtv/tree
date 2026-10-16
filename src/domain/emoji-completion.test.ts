import { expect, it } from 'vitest'
import { suggestEmoji } from './emoji-completion'

// @requirement PRODUCT.md §20.12
it('matches English shortcode prefixes at whitespace boundaries without consuming surrounding text', () => {
  expect(suggestEmoji(':roc', 4)?.suggestions).toContainEqual({ shortcode: 'rocket', emoji: '🚀' })
  expect(suggestEmoji('Plan :ROCKE tomorrow', 11)).toMatchObject({
    start: 5,
    end: 11,
    suggestions: [{ shortcode: 'rocket', emoji: '🚀' }],
  })
  expect(suggestEmoji('\n:woman_techn', 13)?.suggestions).toContainEqual({
    shortcode: 'woman_technologist',
    emoji: '👩‍💻',
  })
  for (const text of [':', 'Plan :', '\n:', ':r']) {
    const match = suggestEmoji(text, text.length)
    expect(match).toMatchObject({ start: text.lastIndexOf(':'), end: text.length })
    expect(match?.suggestions).toHaveLength(8)
  }
  for (const text of ['https://roc', '12:roc', 'word:roc', ':roc ', ':no_such_emoji', '(:roc']) {
    expect(suggestEmoji(text, text.length)).toBeUndefined()
  }
  expect(suggestEmoji(':rocket', 4)).toBeUndefined()
  for (const caret of [-1, 99, 2.5, NaN]) expect(suggestEmoji(':roc', caret)).toBeUndefined()
})

// @requirement PRODUCT.md §20.12
it('bounds suggestions and orders shortcodes deterministically', () => {
  const suggestions = suggestEmoji(':ma', 3)!.suggestions
  expect(suggestions).toHaveLength(8)
  expect(suggestions.map((entry) => entry.shortcode)).toEqual(suggestions.map((entry) => entry.shortcode).sort())
})
