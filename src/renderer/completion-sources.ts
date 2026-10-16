import { calendarDateOf, formatCanonicalDate, weekdayOf, type DayNumber } from '../domain/calendar-date'
import type { DateTextRange } from '../domain/date-recognition'
import { suggestEmoji } from '../domain/emoji-completion'
import { suggestDates } from '../domain/natural-date'

export interface CompletionSuggestion {
  readonly id: string
  readonly replacement: string
  readonly label: string
  readonly description: string
}

export interface CompletionMatch extends DateTextRange {
  readonly listLabel: string
  /** Whether refining the matched text keeps the selected suggestion by ID. */
  readonly retainsSelection: boolean
  readonly suggestions: readonly CompletionSuggestion[]
}

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Adapts domain recognizers to popup data. Emoji take precedence over dates. */
export function recognizeCompletion(text: string, caret: number, today: DayNumber): CompletionMatch | undefined {
  const emoji = suggestEmoji(text, caret)
  if (emoji !== undefined)
    return {
      start: emoji.start,
      end: emoji.end,
      listLabel: 'Emoji suggestions',
      retainsSelection: false,
      suggestions: emoji.suggestions.map(({ emoji, shortcode }) => ({
        id: `emoji:${shortcode}`,
        replacement: emoji,
        label: emoji,
        description: `:${shortcode}:`,
      })),
    }
  const dates = suggestDates(text, caret, today)
  if (dates === undefined) return undefined
  return {
    start: dates.start,
    end: dates.end,
    listLabel: 'Date suggestions',
    retainsSelection: true,
    suggestions: dates.suggestions.map(({ day, expression }) => {
      const canonical = formatCanonicalDate(calendarDateOf(day))
      return {
        id: `date:${day}`,
        replacement: canonical,
        label: canonical,
        description: `${weekdays[weekdayOf(day)]} · ${expression}`,
      }
    }),
  }
}
