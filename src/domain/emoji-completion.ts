import catalog from './emoji-catalog.json'
import type { DateTextRange } from './date-recognition'

export interface EmojiSuggestion {
  readonly emoji: string
  readonly shortcode: string
}

export interface EmojiMatch extends DateTextRange {
  readonly suggestions: readonly EmojiSuggestion[]
}

const entries: readonly EmojiSuggestion[] = Object.entries(catalog).map(([shortcode, emoji]) => ({ shortcode, emoji }))

function compareRank(left: readonly number[], right: readonly number[]): number {
  // An extra equal-rank iteration yields NaN, equivalent to zero for sorting and our < 0 checks.
  for (let index = 0; index < left.length; index++) {
    const difference = left[index]! - right[index]!
    if (difference !== 0) return difference
  }
  return 0
}

function isWordStart(shortcode: string, index: number): boolean {
  return index === 0 || shortcode[index - 1] === '_'
}

/** Lower ranks win. Contiguous groups retain catalog order; only subsequences use alignment scores. */
function rankShortcode(shortcode: string, query: string): readonly number[] | undefined {
  // Removing the exact-name branch is equivalent: a name sorts before all of its extensions.
  if (shortcode === query) return [0]
  if (shortcode.startsWith(query)) return [1]
  let occurrence = shortcode.indexOf(query)
  if (occurrence !== -1) {
    while (occurrence !== -1) {
      if (isWordStart(shortcode, occurrence)) return [2]
      occurrence = shortcode.indexOf(query, occurrence + 1)
    }
    return [3]
  }

  let cursor = -1
  // This rejection only saves work; the alignment search still rejects non-subsequences.
  for (const character of query) {
    cursor = shortcode.indexOf(character, cursor + 1)
    if (cursor === -1) return undefined
  }

  // At a fixed end, prefer more word starts, then a later start (fewer gaps).
  // Keeping that best predecessor makes all alignments searchable in query × shortcode time.
  type Alignment = readonly [negativeWordStarts: number, negativeStart: number]
  // The first letter ignores predecessor values and replaces this initial workspace.
  let previous: (Alignment | undefined)[] = []
  for (let letter = 0; letter < query.length; letter++) {
    const next: (Alignment | undefined)[] = []
    let best: Alignment | undefined
    // An extra iteration cannot match a query letter beyond the shortcode's end.
    for (let index = 0; index < shortcode.length; index++) {
      const predecessor = previous[index - 1]
      // Equal predecessor ranks contain identical word-start and start values; either may win.
      if (predecessor !== undefined && (best === undefined || compareRank(predecessor, best) < 0)) best = predecessor
      if (shortcode[index] !== query[letter]) continue
      const wordStart = Number(isWordStart(shortcode, index))
      if (letter === 0) next[index] = [-wordStart, -index]
      else if (best !== undefined) next[index] = [best[0] - wordStart, best[1]]
    }
    previous = next
  }
  let rank: readonly number[] | undefined
  // An extra end iteration reads undefined and is skipped.
  for (let end = 0; end < previous.length; end++) {
    const alignment = previous[end]
    if (alignment === undefined) continue
    const start = -alignment[1]
    // For one query, minimizing span also minimizes skipped characters.
    const candidate = [4, alignment[0], end - start, start, shortcode.length]
    // Equal complete ranks are interchangeable.
    if (rank === undefined || compareRank(candidate, rank) < 0) rank = candidate
  }
  return rank
}

/** Shortcodes are literal text until an explicit range replacement accepts a suggestion. */
export function suggestEmoji(text: string, caret: number): EmojiMatch | undefined {
  // caret === 0 cannot contain a colon fragment, even if the initial bound check accepts it.
  if (!Number.isInteger(caret) || caret < 0 || caret > text.length) return undefined
  if (/[a-z0-9_+-]/i.test(text[caret] ?? '')) return undefined
  const fragment = /(?:^|\s):([a-z0-9_+-]*)$/i.exec(text.slice(0, caret))
  if (fragment === null) return undefined
  const query = fragment[1]!.toLowerCase()
  if (query === '') return { start: caret - 1, end: caret, suggestions: entries }
  const ranked = entries.flatMap((entry) => {
    const rank = rankShortcode(entry.shortcode, query)
    return rank === undefined ? [] : [{ entry, rank }]
  })
  // Catalog keys are unique, so equality-only comparator mutations cannot change ordering.
  // Bundled aliases already arrive in shortcode order within each rank; treating a positive
  // tie-break result as zero also retains that order. Arbitrarily reordered catalogs are not an input.
  ranked.sort(
    (left, right) =>
      compareRank(left.rank, right.rank) ||
      (left.entry.shortcode < right.entry.shortcode ? -1 : left.entry.shortcode > right.entry.shortcode ? 1 : 0),
  )
  const suggestions = ranked.map(({ entry }) => entry)
  if (suggestions.length === 0) return undefined
  return { start: caret - query.length - 1, end: caret, suggestions }
}
