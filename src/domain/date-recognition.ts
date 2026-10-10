import { dayNumberOf, isValidCalendarDate, type DayNumber } from './calendar-date'

export interface DateTextRange {
  readonly start: number
  readonly end: number
}

export interface CanonicalDateMatch extends DateTextRange {
  readonly day: DayNumber
}

/**
 * Text that strongly resembles an attempted canonical date but is not one: a four-digit year, a
 * one- or two-digit month, and a one- or two-digit day joined by hyphens, touching no digit, that is
 * not a valid `YYYY-MM-DD` date. Impossible dates such as `2026-02-31` qualify; arbitrary text never
 * does. Offsets are UTF-16 with exclusive ends, and ranges overlapping an excluded range are skipped.
 */
// The default-array mutant is equivalent here for the same reason as in `findCanonicalDates`.
export function findDateLikeTokens(text: string, excludedRanges: readonly DateTextRange[] = []): DateTextRange[] {
  const tokens: DateTextRange[] = []
  for (const match of text.matchAll(/[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}/g)) {
    const start = match.index
    const end = start + match[0].length
    if (/[0-9]/.test(text.slice(start - 1, start)) || /[0-9]/.test(text.slice(end, end + 1))) continue
    if (excludedRanges.some((range) => start < range.end && end > range.start)) continue
    if (findCanonicalDates(match[0]).length > 0) continue
    tokens.push({ start, end })
  }
  return tokens
}

/** Offsets are UTF-16, with exclusive ends, as in the document's link ranges. */
// The default-array mutant contains a string with no range bounds; it cannot
// overlap a token and is equivalent for this typed API.
export function findCanonicalDates(text: string, excludedRanges: readonly DateTextRange[] = []): CanonicalDateMatch[] {
  const dates: CanonicalDateMatch[] = []
  for (const match of text.matchAll(/[0-9]{4}-[0-9]{2}-[0-9]{2}/g)) {
    const start = match.index
    const end = start + match[0].length
    if (/[0-9]/.test(text.slice(start - 1, start)) || /[0-9]/.test(text.slice(end, end + 1))) continue
    if (excludedRanges.some((range) => start < range.end && end > range.start)) continue
    const date = {
      year: Number(match[0].slice(0, 4)),
      month: Number(match[0].slice(5, 7)),
      day: Number(match[0].slice(8, 10)),
    }
    if (isValidCalendarDate(date)) dates.push({ start, end, day: dayNumberOf(date) })
  }
  return dates
}
