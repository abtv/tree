import { describe, expect, it, vi } from 'vitest'
import { prepareSearch, searchText, type SearchPattern } from './text-search'

// @requirement PRODUCT.md §20.2.26

export function pattern(query: string): SearchPattern {
  const work = prepareSearch(query)
  let step = work.next()
  while (!step.done) step = work.next()
  return step.value
}

describe('literal search', () => {
  it('preserves literal Unicode case equivalence for ASCII and cross-ASCII matches', () => {
    const text = Array.from({ length: 128 }, (_, code) => String.fromCharCode(code)).join('') + 'ſK'

    for (const query of text) {
      const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const expected = [...text.matchAll(new RegExp(literal, /\p{Lu}/u.test(query) ? 'gu' : 'giu'))].map((match) => [
        match.index,
        match.index + match[0].length,
      ])
      const actual = [...searchText(text, pattern(query))]
        .filter((match) => match !== undefined)
        .map(({ start, end }) => [start, end])

      expect(actual, JSON.stringify(query)).toEqual(expected)
    }
  })

  function spans(text: string, query: string): number[][] {
    return [...searchText(text, pattern(query))]
      .filter((match) => match !== undefined)
      .map(({ start, end }) => [start, end])
  }

  function expectedSpans(text: string, query: string): number[][] {
    return [...text.matchAll(new RegExp(query, /\p{Lu}/u.test(query) ? 'gu' : 'giu'))].map((match) => [
      match.index,
      match.index + match[0].length,
    ])
  }

  it('keeps non-ASCII case equivalence when repeated comparisons reuse earlier results', () => {
    const text = 'Выпуск ВЫПУСК выпуск Ёлка ёЛКА ǅ ǆ Ǆ Straße STRASSE \u{10400}\u{10428} KKk ſs'

    for (const pass of [1, 2]) {
      for (const query of ['выпуск', 'Выпуск', 'ёлка', 'ǆ', 'ǅ', 'straße', '\u{10428}', '\u{10400}', 'k', 'ſ']) {
        expect(spans(text, query), `${query} pass ${pass}`).toEqual(expectedSpans(text, query))
      }
    }
  })

  // The pattern characters below appear in no other test, so earlier tests cannot have resolved their pairs.
  it('resolves each non-ASCII character pair once, keeping pages of other blocks', () => {
    const compile = vi.spyOn(globalThis, 'RegExp')

    try {
      // Ӂ and é lie in different 256-character blocks, so the pattern character alternates between two pages.
      expect(spans('Ӂé'.repeat(1000), 'ӂ')).toHaveLength(1000)

      expect(compile).toHaveBeenCalledTimes(2)
    } finally {
      compile.mockRestore()
    }
  })

  it('starts the bounded equivalence table over once it is full and still matches afterwards', () => {
    expect(spans('Ӄ', 'ӄ')).toEqual([[0, 1]])
    // One character from each 256-character block except surrogates: more pages than the bound allows.
    let blocks = ''
    for (let code = 0x100; code <= 0x10ffff; code += 0x100) {
      if (code < 0xd800 || code > 0xdfff) blocks += String.fromCodePoint(code)
    }
    expect(spans(blocks, 'ӆ')).toEqual([])
    const compile = vi.spyOn(globalThis, 'RegExp')

    try {
      expect(spans('Ӄ', 'ӄ')).toEqual([[0, 1]])

      // Filling the table with another pattern character released the earlier pair, so it is resolved again.
      expect(compile).toHaveBeenCalledOnce()
    } finally {
      compile.mockRestore()
    }
  })

  it('checkpoints unmatched text and prefix fallback work at least once per eight characters', () => {
    const checkpoints = (text: string, query: string): number =>
      [...searchText(text, pattern(query))].filter((match) => match === undefined).length

    expect(checkpoints('a'.repeat(1000), 'z')).toBeGreaterThanOrEqual(125)
    expect(checkpoints('я'.repeat(1000), 'ю')).toBeGreaterThanOrEqual(125)
    expect(checkpoints('a'.repeat(1000), `${'a'.repeat(50)}b`)).toBeGreaterThanOrEqual(125)
    expect(checkpoints('a'.repeat(1000), 'z')).toBeLessThanOrEqual(126)
  })

  it('checkpoints a long prefix fallback within one character once per eight steps', () => {
    const query = `${'a'.repeat(1000)}b`
    const work = [...searchText(`${'a'.repeat(1000)}c`, pattern(query))]

    // 1000 matched characters, then 1000 fallback steps at `c`, then `c` itself.
    expect(work.filter((match) => match === undefined)).toHaveLength(250)
  })

  it.each([
    [
      'a.b [x] a.b',
      'a.b',
      [
        [0, 3],
        [8, 11],
      ],
    ],
    ['aaa', 'aa', [[0, 2]]],
    [
      'aAaA',
      'aa',
      [
        [0, 2],
        [2, 4],
      ],
    ],
    ['aAaA', 'Aa', [[1, 3]]],
    [
      'Σσς',
      'σ',
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    ],
    ['Σσς', 'Σ', [[0, 1]]],
    [
      'x😀😀',
      '😀',
      [
        [1, 3],
        [3, 5],
      ],
    ],
    ['a\u0301é', '\u0301', [[1, 2]]],
    ['a\u0301é', 'á', []],
    ['\ud83d😀\ude00', '😀', [[1, 3]]],
    ['\ud83d😀\ude00', '\ude00', [[3, 4]]],
    ['\ud83da', 'a', [[1, 2]]],
    ['\ud83d', '', [[1, 2]]],
    ['a\ude00', '\ude00', [[1, 2]]],
    ['￿a', 'a', [[1, 2]]],
    ['x\u{10000}', '\u{10000}', [[1, 3]]],
    ['x\u{10ffff}', '\u{10ffff}', [[1, 3]]],
    [
      '\u{10400}a\u{10428}b',
      '\u{10428}',
      [
        [0, 2],
        [3, 5],
      ],
    ],
    ['Straße', 'ss', []],
    ['visit https://example.org now', '.org now', [[21, 29]]],
    ['anything', '', []],
    ['ababababac', 'ababac', [[4, 10]]],
    ['abaa', 'aa', [[2, 4]]],
    ['aaaab', 'aaab', [[1, 5]]],
    ['aababb', 'aabb', []],
    ['abba', 'aba', []],
    ['aba', 'aa', []],
  ])('matches %j with %j', (text, query, expected) => {
    expect(
      [...searchText(text, pattern(query))]
        .filter((match) => match !== undefined)
        .map(({ start, end }) => [start, end]),
    ).toEqual(expected)
  })
})
