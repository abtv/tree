/** Integer days since 1970-01-01 in the proleptic Gregorian calendar. */
export type DayNumber = number

export interface CalendarDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

function leapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

// Hoisted so date recognition over very large documents allocates nothing per call.
const commonYearMonthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function monthLength(year: number, month: number): number {
  // An out-of-range month yields undefined, so the final day comparison also
  // rejects it. Mutating either explicit month bound is therefore equivalent.
  return month === 2 && leapYear(year) ? 29 : commonYearMonthLengths[month - 1]!
}

/** Four-digit canonical years, including astronomical year zero. */
export function isValidCalendarDate({ year, month, day }: CalendarDate): boolean {
  return (
    Number.isInteger(year) &&
    year >= 0 &&
    year <= 9999 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= monthLength(year, month)
  )
}

function yearStart(year: number): number {
  return 365 * year + Math.floor((year + 3) / 4) - Math.floor((year + 99) / 100) + Math.floor((year + 399) / 400)
}

const epoch = yearStart(1970)

export function dayNumberOf(date: CalendarDate): DayNumber {
  // Error-message mutations survive deliberately: callers rely on RangeError,
  // not its internal diagnostic wording (also true of the other guards below).
  if (!isValidCalendarDate(date)) throw new RangeError('Invalid calendar date')
  let days = yearStart(date.year) - epoch + date.day - 1
  for (let month = 1; month < date.month; month++) days += monthLength(date.year, month)
  return days
}

export function calendarDateOf(day: DayNumber): CalendarDate {
  if (!Number.isInteger(day) || day < -epoch || day >= yearStart(10000) - epoch) {
    throw new RangeError('Day number outside canonical calendar range')
  }
  const absolute = day + epoch
  let lower = 0
  let upper = 10000
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2)
    if (yearStart(middle) <= absolute) lower = middle
    else upper = middle
  }
  let remaining = absolute - yearStart(lower)
  let month = 1
  while (remaining >= monthLength(lower, month)) {
    remaining -= monthLength(lower, month)
    month++
  }
  return { year: lower, month, day: remaining + 1 }
}

/** Monday = 0, Sunday = 6. The epoch was a Thursday. */
export function weekdayOf(day: DayNumber): number {
  return (((day + 3) % 7) + 7) % 7
}

export function formatCanonicalDate(date: CalendarDate): string {
  if (!isValidCalendarDate(date)) throw new RangeError('Invalid calendar date')
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}
