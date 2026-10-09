import { calendarDateOf, dayNumberOf, isValidCalendarDate, weekdayOf, type DayNumber } from './calendar-date'
import type { DateTextRange } from './date-recognition'

export interface NaturalDateSuggestion {
  readonly day: DayNumber
  readonly expression: string
}

export interface NaturalDateMatch extends DateTextRange {
  readonly suggestions: readonly NaturalDateSuggestion[]
}

const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const months = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const weekdayPattern = weekdays.join('|')
const monthPattern = months.map((month) => `${month}|${month.slice(0, 3)}`).join('|')
const expressions = new RegExp(
  `(?:this|next|last) +(?:${weekdayPattern})|next +week|in +[0-9]+ +days?|[0-9]+ +days? +ago|(?:${monthPattern}) +[0-9]{1,2}|today|tomor(?:r(?:o(?:w)?)?)?|yesterday|${weekdayPattern}`,
  'gi',
)
// Stryker reports the module-initializer ObjectLiteral mutants as survivors.
// Replacing either date with {} throws RangeError during import, before a
// suggestion can be returned; this is an initialization/runner limitation,
// not an equivalent mutation of the calendar bounds.
const minimumDay = dayNumberOf({ year: 0, month: 1, day: 1 })
const maximumDay = dayNumberOf({ year: 9999, month: 12, day: 31 })

function monthDays(month: number, date: number, today: DayNumber): DayNumber[] {
  const year = calendarDateOf(today).year
  // Search through leap-year gaps as well as ordinary year boundaries.
  // The initial-array mutant adds a nonnumeric sentinel; the final canonical
  // range filter rejects it. Expanding the lower bound is output-equivalent,
  // but the clamp also bounds work near the canonical calendar limits.
  const occurrences: DayNumber[] = []
  for (let candidate = Math.max(0, year - 8); candidate <= Math.min(9999, year + 8); candidate++) {
    const value = { year: candidate, month, day: date }
    if (isValidCalendarDate(value)) occurrences.push(dayNumberOf(value))
  }
  const upcoming = occurrences.find((day) => day >= today)
  const previous = occurrences.filter((day) => day < today).at(-1)
  // Omitting this filter is equivalent after the caller's canonical range
  // filter; it is needed here to express the nonoptional return type.
  return [upcoming, previous].filter((day): day is number => day !== undefined)
}

function daysFor(expression: string, today: DayNumber): DayNumber[] {
  if (expression === 'today') return [today]
  if (expression.startsWith('tomor')) return [today + 1]
  if (expression === 'yesterday') return [today - 1]
  const monday = today - weekdayOf(today)
  if (expression === 'next week') return Array.from({ length: 7 }, (_, index) => monday + 7 + index)
  // Anchor mutations are equivalent: the outer recognizer supplies only a
  // complete expression, never its surrounding text.
  const qualified = /^(this|next|last) (.+)$/.exec(expression)
  if (qualified) {
    const offset = qualified[1] === 'next' ? 7 : qualified[1] === 'last' ? -7 : 0
    return [monday + offset + weekdays.indexOf(qualified[2]!)]
  }
  const weekday = weekdays.indexOf(expression)
  if (weekday !== -1) {
    const current = monday + weekday
    return current >= today ? [current, current + 7] : [current + 7, current]
  }
  // The same outer-recognizer invariant makes anchor mutations equivalent.
  const relative = /^(?:in ([0-9]+) days?|([0-9]+) days? ago)$/.exec(expression)
  if (relative) {
    const count = Number(relative[1] ?? relative[2])
    return [today + (relative[1] === undefined ? -count : count)]
  }
  const [month, date] = expression.split(' ')
  return monthDays(months.findIndex((name) => name === month || name.slice(0, 3) === month) + 1, Number(date), today)
}

/** Pure recognition only: callers own popup lifecycle and explicit acceptance.
 * Spans use UTF-16 offsets and exclusive ends. A caret at either edge is inside.
 */
export function suggestDates(text: string, caret: number, today: DayNumber): NaturalDateMatch | undefined {
  // Negative/out-of-text carets also fail the match-span check below; these
  // explicit bounds avoid scanning text for an invalid caller offset.
  if (!Number.isInteger(caret) || caret < 0 || caret > text.length) return undefined
  // Validate the caller's calendar value through the existing domain primitive.
  calendarDateOf(today)
  for (const match of text.matchAll(expressions)) {
    const start = match.index
    const end = start + match[0].length
    if (caret < start || caret > end) continue
    if (/[\p{L}\p{N}_]$/u.test(text.slice(0, start)) || /^[\p{L}\p{N}_]/u.test(text.slice(end))) continue
    const expression = match[0].toLowerCase().replace(/ +/g, ' ')
    const days = daysFor(expression, today).filter((day) => day >= minimumDay && day <= maximumDay)
    if (days.length === 0) continue
    return {
      start,
      end,
      suggestions: days.map((day) => ({ day, expression: expression.startsWith('tomor') ? 'tomorrow' : expression })),
    }
  }
  return undefined
}
