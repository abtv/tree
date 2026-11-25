/** A yielded undefined is a work checkpoint, not a match. Offsets are UTF-16. */
export type SearchWork<T> = Generator<T | undefined, void>

export interface TextMatch {
  readonly start: number
  readonly end: number
}

export interface SearchPattern {
  readonly characters: readonly string[]
  /** Code points of `characters`: the matcher compares numbers and allocates no one-character strings. */
  readonly codes: readonly number[]
  readonly fallback: readonly number[]
  readonly sensitive: boolean
  readonly shortLiteral?: RegExp
}

// Compared characters and prefix fallbacks between two checkpoints. One checkpoint per character made
// generator resumption, not matching, the dominant cost of a document scan.
const workPerCheckpoint = 8
const nativeTextLimit = 512
const nativeQueryLimit = 32
const literalSource = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Case equivalence of a pattern code point with text code points, in pages of 256 results (0 is unknown).
// Compiling a RegExp for every compared character dominated case-insensitive scans of non-ASCII text.
const equivalencePages = new Map<number, Uint8Array[]>()
// About 1 MiB. Ordinary alphabets use a few pages per query character; the bound guards pathological text.
const equivalencePageLimit = 4096
let equivalencePageCount = 0

function equivalent(left: number, right: number): boolean {
  let pages = equivalencePages.get(right)
  let page = pages?.[left >> 8]
  if (page === undefined) {
    if (equivalencePageCount === equivalencePageLimit) {
      equivalencePages.clear()
      equivalencePageCount = 0
      pages = undefined
    }
    if (pages === undefined) {
      pages = []
      equivalencePages.set(right, pages)
    }
    page = new Uint8Array(256)
    pages[left >> 8] = page
    equivalencePageCount++
  }

  const known = page[left & 255]!
  if (known !== 0) return known === 1
  const source = literalSource(String.fromCodePoint(left))
  const result = new RegExp(`^(?:${source})$`, 'iu').test(String.fromCodePoint(right))
  page[left & 255] = result ? 1 : 2
  return result
}

// Unicode simple case equivalence, without normalizing or expanding the source text.
function equal(left: number, right: number, sensitive: boolean): boolean {
  if (left === right) return true
  if (sensitive) return false

  if (left < 128 && right < 128) {
    const foldedLeft = left >= 65 && left <= 90 ? left + 32 : left
    const foldedRight = right >= 65 && right <= 90 ? right + 32 : right
    return foldedLeft === foldedRight
  }

  return equivalent(left, right)
}

/** Query preparation is incremental too: pasted queries can be unusually long. */
export function* prepareSearch(
  query: string,
  options?: { nativeShortText: boolean },
): Generator<undefined, SearchPattern> {
  const characters: string[] = []
  const codes: number[] = []
  const fallback: number[] = []
  let sensitive = false
  for (const character of query) {
    characters.push(character)
    codes.push(character.codePointAt(0)!)
    fallback.push(0)
    if (/\p{Lu}/u.test(character)) sensitive = true
    yield undefined
  }
  let prefix = 0
  for (let index = 1; index < codes.length; index++) {
    while (prefix > 0 && !equal(codes[index]!, codes[prefix]!, sensitive)) {
      prefix = fallback[prefix - 1]!
      yield undefined
    }
    if (equal(codes[index]!, codes[prefix]!, sensitive)) prefix++
    fallback[index] = prefix
    yield undefined
  }
  const shortLiteral =
    options?.nativeShortText && query.length > 0 && query.length <= nativeQueryLimit
      ? new RegExp(literalSource(query), sensitive ? 'gu' : 'giu')
      : undefined
  return { characters, codes, fallback, sensitive, ...(shortLiteral && { shortLiteral }) }
}

/** The UTF-16 offset `count` code points before `end`, pairing surrogates as forward iteration does. */
function codePointsBefore(text: string, end: number, count: number): number {
  let start = end
  for (let step = 0; step < count; step++) {
    const low = text.charCodeAt(start - 1)
    const high = start > 1 ? text.charCodeAt(start - 2) : 0
    start -= low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff ? 2 : 1
  }
  return start
}

/** Streaming KMP avoids rescanning long near-matches and never copies the node text. */
export function* searchText(text: string, pattern: SearchPattern): SearchWork<TextMatch> {
  const { codes, fallback, sensitive, shortLiteral } = pattern
  if (codes.length === 0) return
  let offset = 0
  // The native engine avoids per-character generator work for ordinary short rows. Bound both
  // inputs so a single step cannot run a long uninterruptible scan. Long text still streams.
  if (shortLiteral && text.length <= nativeTextLimit) {
    while (offset < text.length) {
      // Another row may use the same pattern while this iterator is paused.
      shortLiteral.lastIndex = offset
      const found = shortLiteral.exec(text)
      if (found === null) {
        yield undefined
        return
      }
      offset = shortLiteral.lastIndex
      yield { start: found.index, end: offset }
    }
    return
  }
  let prefix = 0
  let work = 0
  while (offset < text.length) {
    const code = text.codePointAt(offset)!
    while (prefix > 0 && !equal(code, codes[prefix]!, sensitive)) {
      prefix = fallback[prefix - 1]!
      if (++work === workPerCheckpoint) {
        work = 0
        yield undefined
      }
    }
    if (equal(code, codes[prefix]!, sensitive)) prefix++
    offset += code > 0xffff ? 2 : 1
    if (prefix === codes.length) {
      yield { start: codePointsBefore(text, offset, codes.length), end: offset }
      prefix = 0 // Nonoverlap is defined by the forward stream, including reverse navigation.
      work = 0
    } else if (++work === workPerCheckpoint) {
      work = 0
      yield undefined
    }
  }
}
