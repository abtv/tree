import { calendarDateOf, formatCanonicalDate, weekdayOf, type DayNumber } from '../domain/calendar-date'
import type { DateTextRange } from '../domain/date-recognition'
import { suggestEmoji } from '../domain/emoji-completion'
import { suggestDates } from '../domain/natural-date'
import type { TagMatch } from '../domain/tag-catalog'
import { findTags } from '../domain/tags'

export interface CompletionSuggestion {
  readonly id: string
  readonly replacement: string
  readonly label: string
  readonly description: string
}

export interface CompletionMatch extends DateTextRange {
  readonly listLabel: string
  /** Retain by semantic ID first, then replacement when only its meaning changes. */
  readonly retainsSelection: boolean
  /** Preferred choice independently of the displayed suggestion order. */
  readonly preferredSuggestionId: string
  readonly suggestions: readonly CompletionSuggestion[]
}

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Adapts domain recognizers to popup data. Explicit tag/emoji fragments take precedence over dates. */
export function recognizeCompletion(
  text: string,
  caret: number,
  today: DayNumber,
  tags?: TagMatch,
): CompletionMatch | undefined {
  if (tags !== undefined)
    return {
      start: tags.start,
      end: tags.end,
      listLabel: 'Tag suggestions',
      retainsSelection: false,
      preferredSuggestionId: `tag:${tags.suggestions[0]!}`,
      suggestions: tags.suggestions.map((name) => ({
        id: `tag:${name}`,
        replacement: `#${name}`,
        label: `#${name}`,
        description: '',
      })),
    }
  const emoji = suggestEmoji(text, caret)
  if (emoji !== undefined)
    return {
      start: emoji.start,
      end: emoji.end,
      listLabel: 'Emoji suggestions',
      retainsSelection: false,
      preferredSuggestionId: `emoji:${emoji.suggestions[0]!.shortcode}`,
      suggestions: emoji.suggestions.map(({ emoji, shortcode }) => ({
        id: `emoji:${shortcode}`,
        replacement: emoji,
        label: emoji,
        description: `:${shortcode}:`,
      })),
    }
  const dates = suggestDates(text, caret, today)
  if (dates === undefined) return undefined
  // A new literal tag such as #today must not fall through to date acceptance.
  if (findTags(text).some((tag) => tag.start < dates.end && tag.end > dates.start)) return undefined
  return {
    start: dates.start,
    end: dates.end,
    listLabel: 'Date suggestions',
    retainsSelection: true,
    preferredSuggestionId: `date:${dates.suggestions[0]!.day}:${dates.suggestions[0]!.expression}`,
    suggestions: dates.suggestions
      .toSorted((first, second) => first.day - second.day)
      .map(({ day, expression }) => {
        const canonical = formatCanonicalDate(calendarDateOf(day))
        return {
          id: `date:${day}:${expression}`,
          replacement: canonical,
          label: canonical,
          description: `${weekdays[weekdayOf(day)]} · ${expression}`,
        }
      }),
  }
}
