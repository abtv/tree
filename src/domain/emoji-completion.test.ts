import { expect, it } from 'vitest'
import { suggestEmoji } from './emoji-completion'
import catalog from './emoji-catalog.json'

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
    expect(match!.suggestions.length).toBeGreaterThan(8)
  }
  for (const text of ['https://roc', 'https://1', '12:100', '12:roc', 'word:roc', ':roc ', ':no_such_emoji', '(:roc']) {
    expect(suggestEmoji(text, text.length)).toBeUndefined()
  }
  expect(suggestEmoji(':rocket', 4)).toBeUndefined()
  for (const caret of [-1, 99, 2.5, NaN]) expect(suggestEmoji(':roc', caret)).toBeUndefined()
})

// @requirement PRODUCT.md §20.12
it('includes every matching shortcode in deterministic order', () => {
  for (const prefix of ['', 'ma', 'r']) {
    const text = `:${prefix}`
    const suggestions = suggestEmoji(text, text.length)!.suggestions
    expect(suggestions.map((entry) => entry.shortcode)).toEqual(
      Object.keys(catalog).filter((shortcode) => shortcode.startsWith(prefix)),
    )
  }
})

// @requirement PRODUCT.md §20.12
it('keeps every catalog shortcode reachable through each typed prefix', () => {
  for (const [shortcode, emoji] of Object.entries(catalog)) {
    for (let length = 1; length <= shortcode.length; length++) {
      const text = `Plan :${shortcode.slice(0, length)}`
      expect(suggestEmoji(text, text.length)?.suggestions).toContainEqual({ shortcode, emoji })
    }
  }
})
