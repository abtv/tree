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

/** Shortcodes are literal text until an explicit range replacement accepts a suggestion. */
export function suggestEmoji(text: string, caret: number): EmojiMatch | undefined {
  if (!Number.isInteger(caret) || caret < 0 || caret > text.length) return undefined
  if (/[a-z0-9_+-]/i.test(text[caret] ?? '')) return undefined
  const fragment = /(?:^|\s):([a-z0-9_+-]*)$/i.exec(text.slice(0, caret))
  if (fragment === null) return undefined
  const prefix = fragment[1]!.toLowerCase()
  const suggestions = entries.filter((entry) => entry.shortcode.startsWith(prefix))
  if (suggestions.length === 0) return undefined
  return { start: caret - prefix.length - 1, end: caret, suggestions }
}
