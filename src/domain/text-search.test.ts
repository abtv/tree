import { describe, expect, it, vi } from 'vitest'
import { prepareSearch, searchText, wholeSearchMatcher, type SearchPattern } from './text-search'

// @requirement PRODUCT.md §20.2.26

export function pattern(query: string): SearchPattern {
  const work = prepareSearch(query)
  let step = work.next()
  while (!step.done) step = work.next()
  return step.value
}

describe('whole marker name search', () => {
  it('uses Unicode smart case and rejects different names of the same length', () => {
    const insensitive = wholeSearchMatcher('ος')
    const sensitive = wholeSearchMatcher('ΟΣ')

    expect(insensitive('ΟΣ')).toBe(true)
    expect(insensitive('οσ')).toBe(true)
    expect(insensitive('οχ')).toBe(false)
    expect(insensitive('ο')).toBe(false)
    expect(insensitive('οσα')).toBe(false)
    expect(sensitive('ΟΣ')).toBe(true)
    expect(sensitive('οσ')).toBe(false)
  })
})

describe('literal search', () => {
  it('does not compile case-equivalence expressions for ASCII-only searches', () => {
    const compile = vi.spyOn(globalThis, 'RegExp')

    try {
      expect(spans('Plan PLAN plan', 'plan')).toEqual([
        [0, 4],
        [5, 9],
        [10, 14],
      ])
      expect(compile).not.toHaveBeenCalled()
    } finally {
      compile.mockRestore()
    }
  })

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

  it('keeps different case results for code points at the same offset on different cache pages', () => {
    // É and ǉ both end in C9, but only É matches é under smart case.
    const text = 'ÉǉǉÉ'
    const expected = [
      [0, 1],
      [3, 4],
    ]

    expect(spans(text, 'é')).toEqual(expected)
    expect(spans(text, 'é')).toEqual(expected)
  })

  it('reports complete UTF-16 spans for adjacent matches with both BMP and astral characters', () => {
    const text = '😀A😀Éa😀é'

    expect(spans(text, 'a😀é')).toEqual([
      [2, 6],
      [6, 10],
    ])
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

  it('yields through both passes while preparing a long pasted query', () => {
    const characters = 256
    const query = 'a'.repeat(characters)

    const checkpoints = [...prepareSearch(query)]

    // One checkpoint per character, then one per prefix-table entry after the first.
    expect(checkpoints).toHaveLength(2 * characters - 1)
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
