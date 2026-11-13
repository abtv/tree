import fc from 'fast-check'
import { expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { rankCompletionName } from './completion-ranking'

function exhaustiveRank(name: string, query: string): readonly number[] | undefined {
  const letters = [...query]
  const characters: { text: string; start: number }[] = []
  let offset = 0
  for (const text of name) {
    characters.push({ text, start: offset })
    offset += text.length
  }
  if (name === query) return [0]
  if (name.startsWith(query)) return [1]
  const ranks: number[][] = []
  const visit = (positions: number[], next: number): void => {
    if (positions.length === letters.length) {
      const start = characters[positions[0]!]!.start
      const last = characters[positions.at(-1)!]!
      const span = last.start + last.text.length - start
      const wordStart = (index: number): boolean => index === 0 || '_-'.includes(name[index - 1]!)
      const words = positions.filter((position) => wordStart(characters[position]!.start)).length
      ranks.push(span === query.length ? [wordStart(start) ? 2 : 3] : [4, -words, span - 1, start, name.length])
      return
    }
    for (let index = next; index < characters.length; index++) {
      if (characters[index]!.text === letters[positions.length]) visit([...positions, index], index + 1)
    }
  }
  visit([], 0)
  ranks.sort((left, right) => {
    for (let index = 0; index < left.length; index++) {
      if (left[index] !== right[index]) return left[index]! - right[index]!
    }
    return 0
  })
  return ranks[0]
}

// @requirement PRODUCT.md §20.12
// @requirement PRODUCT.md §20.13
it('agrees with complete code-point alignments for repeated letters and word boundaries', () => {
  const alphabet = fc.constantFrom('a', 'b', 'c', '_', '-', '𐐀', '𐐁')

  fc.assert(
    fc.property(
      fc.array(alphabet, { minLength: 1, maxLength: 12 }),
      fc.array(alphabet, { minLength: 1, maxLength: 5 }),
      fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
      (nameLetters, queryLetters, selectedPositions) => {
        const name = nameLetters.join('')
        const selected = nameLetters.filter((_, index) => selectedPositions[index]).slice(0, 5)
        const subsequence = (selected.length === 0 ? [nameLetters[0]!] : selected).join('')

        for (const query of [queryLetters.join(''), subsequence]) {
          expect(rankCompletionName(name, query, '_-')).toEqual(exhaustiveRank(name, query))
        }
      },
    ),
    { numRuns: propertyRuns(1000) },
  )
})
