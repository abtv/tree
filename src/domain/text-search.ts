/** A yielded undefined is a work checkpoint, not a match. Offsets are UTF-16. */
export type SearchWork<T> = Generator<T | undefined, void>

export interface TextMatch {
  readonly start: number
  readonly end: number
}

export interface SearchPattern {
  readonly characters: readonly string[]
  readonly fallback: readonly number[]
  readonly sensitive: boolean
}

// Unicode simple case equivalence, without normalizing or expanding the source text.
function equal(left: string, right: string, sensitive: boolean): boolean {
  if (left === right) return true
  if (sensitive) return false
  return new RegExp(`^(?:${left.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})$`, 'iu').test(right)
}

/** Query preparation is incremental too: pasted queries can be unusually long. */
export function* prepareSearch(query: string): Generator<undefined, SearchPattern> {
  const characters: string[] = []
  const fallback: number[] = []
  let sensitive = false
  for (const character of query) {
    characters.push(character)
    fallback.push(0)
    if (/\p{Lu}/u.test(character)) sensitive = true
    yield undefined
  }
  let prefix = 0
  for (let index = 1; index < characters.length; index++) {
    while (prefix > 0 && !equal(characters[index]!, characters[prefix]!, sensitive)) {
      prefix = fallback[prefix - 1]!
      yield undefined
    }
    if (equal(characters[index]!, characters[prefix]!, sensitive)) prefix++
    fallback[index] = prefix
    yield undefined
  }
  return { characters, fallback, sensitive }
}

/** Streaming KMP avoids rescanning long near-matches and never copies the node text. */
export function* searchText(text: string, pattern: SearchPattern): SearchWork<TextMatch> {
  const { characters, fallback, sensitive } = pattern
  if (characters.length === 0) return
  const starts: number[] = []
  let offset = 0
  let index = 0
  let prefix = 0
  for (const character of text) {
    starts[index % characters.length] = offset
    while (prefix > 0 && !equal(character, characters[prefix]!, sensitive)) {
      prefix = fallback[prefix - 1]!
      yield undefined
    }
    if (equal(character, characters[prefix]!, sensitive)) prefix++
    offset += character.length
    index++
    if (prefix === characters.length) {
      yield { start: starts[(index - characters.length) % characters.length]!, end: offset }
      prefix = 0 // Nonoverlap is defined by the forward stream, including reverse navigation.
    } else {
      yield undefined
    }
  }
}
