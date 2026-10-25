import { expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { suggestEmoji } from './emoji-completion'
import catalog from './emoji-catalog.json'

vi.mock('./emoji-catalog.json', () => ({
  default: Object.fromEntries(
    [
      'a',
      'a_a',
      'a_a_b_c',
      'a_ab',
      'a_b',
      'a_b_c',
      'a_bc',
      'aa',
      'aa_b',
      'aa_bc',
      'aaa',
      'ab',
      'ab_c',
      'aba',
      'abac',
      'abbc',
      'abc',
      'abc_a_bc',
      'abcabc',
      'ac',
      'acb',
      'b_a_bc',
      'b_ab',
      'b_ac',
      'ba',
      'ba_b',
      'baabc',
      'bab',
      'babc',
      'babc_a_b_c',
      'babca',
      'babcb',
      'bac',
      'bb_a_c',
      'bbabc',
      'bca',
      'c',
      'c_ab',
      'ca',
      'cab',
      'cabac',
      'cb',
    ]
      .sort()
      .reverse()
      .map((shortcode) => [shortcode, '🙂']),
  ),
}))

function names(query: string): string[] {
  return suggestEmoji(`:${query}`, query.length + 1)?.suggestions.map(({ shortcode }) => shortcode) ?? []
}

// @requirement PRODUCT.md §20.12
it('orders exact, prefix, word-prefix, substring and subsequence groups alphabetically within contiguous groups', () => {
  expect(names('ab').slice(0, 8)).toEqual(['ab', 'ab_c', 'aba', 'abac', 'abbc', 'abc', 'abc_a_bc', 'abcabc'])

  const results = names('ab')

  expect(results.indexOf('a_ab')).toBeLessThan(results.indexOf('b_ab'))
  expect(results.indexOf('b_ab')).toBeLessThan(results.indexOf('cab'))
  expect(results.indexOf('cab')).toBeLessThan(results.indexOf('a_b'))
})

// @requirement PRODUCT.md §20.12
it('ranks fuzzy alignments by word starts, gaps, start, length and finally alphabetically', () => {
  const results = names('ac')
  const before = (left: string, right: string): void => {
    expect(results.indexOf(left)).toBeGreaterThanOrEqual(0)
    expect(results.indexOf(right)).toBeGreaterThanOrEqual(0)
    expect(results.indexOf(left)).toBeLessThan(results.indexOf(right))
  }
  before('a_b_c', 'abc') // Word starts beat proximity.
  before('abc', 'abbc') // Fewer gaps.
  before('babc', 'bbabc') // Earlier start with the same gaps and word starts.
  before('babc', 'babca') // Shorter name with the same alignment.
  before('babca', 'babcb') // Alphabetical tie.
})

// @requirement PRODUCT.md §20.12
it('chooses the best alignment, matching an exhaustive search across repeated letters and word boundaries', () => {
  const compare = (a: readonly number[], b: readonly number[]): number => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!
    return 0
  }
  const expected = (query: string): string[] =>
    Object.keys(catalog)
      .flatMap((name) => {
        const ranks: number[][] = []
        function visit(positions: number[]): void {
          if (positions.length === query.length) {
            const start = positions[0]!
            const span = positions.at(-1)! - start + 1
            const boundaries = positions.filter((index) => index === 0 || name[index - 1] === '_').length
            const contiguous = span === query.length
            const group =
              name === query
                ? 0
                : name.startsWith(query)
                  ? 1
                  : contiguous
                    ? start === 0 || name[start - 1] === '_'
                      ? 2
                      : 3
                    : 4
            ranks.push(group === 4 ? [group, -boundaries, span - query.length, start, name.length] : [group])
            return
          }
          for (let index = (positions.at(-1) ?? -1) + 1; index < name.length; index++) {
            if (name[index] === query[positions.length]) visit([...positions, index])
          }
        }
        visit([])
        ranks.sort(compare)
        return ranks.length === 0 ? [] : [{ name, rank: ranks[0]! }]
      })
      .sort((a, b) => compare(a.rank, b.rank) || (a.name < b.name ? -1 : 1))
      .map(({ name }) => name)

  fc.assert(
    fc.property(fc.array(fc.constantFrom('a', 'b', 'c', '_'), { minLength: 1, maxLength: 5 }), (letters) => {
      const query = letters.join('')

      expect(names(query)).toEqual(expected(query))
    }),
    { numRuns: 500, seed: 20261022 },
  )

  expect(names('ac')).toEqual(expected('ac'))
})
