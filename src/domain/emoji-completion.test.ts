import { expect, it } from 'vitest'
import { suggestEmoji } from './emoji-completion'
import catalog from './emoji-catalog.json'

// @requirement PRODUCT.md §20.12
it('matches English shortcode prefixes at whitespace boundaries without consuming surrounding text', () => {
  expect(suggestEmoji(':roc', 4)?.suggestions).toContainEqual({ shortcode: 'rocket', emoji: '🚀' })
  expect(suggestEmoji('Plan :ROCKE tomorrow', 11)).toMatchObject({
    start: 5,
    end: 11,
    suggestions: expect.arrayContaining([{ shortcode: 'rocket', emoji: '🚀' }]),
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
it('includes every ordered subsequence and uses lexical shortcode order for an empty query', () => {
  for (const query of ['', 'ma', 'r', 'rkt', 'wtech', 'thup', '+1', '-1']) {
    const text = `:${query}`
    const suggestions = suggestEmoji(text, text.length)!.suggestions
    const expected = Object.keys(catalog).filter((shortcode) => {
      let position = 0
      for (const letter of shortcode) if (letter === query[position]) position++
      return position === query.length
    })

    expect(suggestions.map((entry) => entry.shortcode).toSorted()).toEqual(expected.toSorted())
    if (query === '') expect(suggestions.map((entry) => entry.shortcode)).toEqual(expected.toSorted())
  }
})

// @requirement PRODUCT.md §20.12
it('prioritizes exact names and prefixes while finding English abbreviations without correcting typos', () => {
  const names = (query: string): string[] =>
    suggestEmoji(`:${query}`, query.length + 1)?.suggestions.map(({ shortcode }) => shortcode) ?? []

  expect(names('cat').slice(0, 2)).toEqual(['cat', 'cat2'])
  expect(names('cat')).toContain('joy_cat')
  expect(names('rkt')).toContain('rocket')
  expect(names('RKT')).toEqual(names('rkt'))
  expect(names('wtech')).toContain('woman_technologist')
  expect(names('mtech')).toContain('man_technologist')
  expect(names('techn')).toEqual(expect.arrayContaining(['woman_technologist', 'man_technologist']))
  expect(names('rocekt')).not.toContain('rocket')
  expect(names('raket')).not.toContain('rocket')
  expect(names('ракета')).toEqual([])

  const c = names('c')
  const prefixes = Object.keys(catalog).filter((name) => name.startsWith('c'))

  expect(c.slice(0, prefixes.length)).toEqual(prefixes)
  expect(c.indexOf('joy_cat')).toBeLessThan(c.indexOf('rocket'))
})

// @requirement PRODUCT.md §20.12
it.each(Array.from({ length: Math.ceil(Object.keys(catalog).length / 50) }, (_, batch) => batch))(
  'keeps every catalog shortcode reachable through each typed prefix (catalog batch %i)',
  (batch) => {
    for (const [shortcode, emoji] of Object.entries(catalog).slice(batch * 50, (batch + 1) * 50)) {
      for (let length = 1; length <= shortcode.length; length++) {
        const text = `Plan :${shortcode.slice(0, length)}`

        expect(suggestEmoji(text, text.length)?.suggestions).toContainEqual({ shortcode, emoji })
      }
    }
  },
)
