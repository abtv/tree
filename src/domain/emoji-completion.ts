import catalog from './emoji-catalog.json'
import type { DateTextRange } from './date-recognition'
import {
  compareCompletionRank as compareRank,
  CompletionRankWorkspace,
  rankCompletionName as rankShortcode,
} from './completion-ranking'

export interface EmojiSuggestion {
  readonly emoji: string
  readonly shortcode: string
}

export interface EmojiMatch extends DateTextRange {
  readonly suggestions: readonly EmojiSuggestion[]
}

const entries: readonly EmojiSuggestion[] = Object.entries(catalog).map(([shortcode, emoji]) => ({ shortcode, emoji }))

/** Shortcodes are literal text until an explicit range replacement accepts a suggestion. */
export function suggestEmoji(text: string, caret: number): EmojiMatch | undefined {
  // caret === 0 cannot contain a colon fragment, even if the initial bound check accepts it.
  if (!Number.isInteger(caret) || caret < 0 || caret > text.length) return undefined
  if (/[a-z0-9_+-]/i.test(text[caret] ?? '')) return undefined
  const fragment = /(?:^|\s):([a-z0-9_+-]*)$/i.exec(text.slice(0, caret))
  if (fragment === null) return undefined
  const query = fragment[1]!.toLowerCase()
  if (query === '') return { start: caret - 1, end: caret, suggestions: entries }
  const workspace = new CompletionRankWorkspace()
  const ranked = entries.flatMap((entry) => {
    const rank = rankShortcode(entry.shortcode, query, '_', workspace)
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
