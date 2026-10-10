import { describe, expect, it, vi } from 'vitest'
import { calendarDateOf, dayNumberOf, formatCanonicalDate } from './calendar-date'
import { suggestDates } from './natural-date'

const day = (value: string): number => {
  const [year, month, date] = value.split('-').map(Number)
  return dayNumberOf({ year: year!, month: month!, day: date! })
}
const today = day('2026-10-08')
const dates = (text: string, reference = today, caret = text.length): string[] | undefined =>
  suggestDates(text, caret, reference)?.suggestions.map((suggestion) =>
    formatCanonicalDate(calendarDateOf(suggestion.day)),
  )

describe('natural date expression table proposed in AG-22', () => {
  it.each([
    ['today', ['2026-10-08']],
    ['tomor', ['2026-10-09']],
    ['tomorr', ['2026-10-09']],
    ['tomorro', ['2026-10-09']],
    ['tomorrow', ['2026-10-09']],
    ['yesterday', ['2026-10-07']],
    ['Friday', ['2026-10-09', '2026-10-16']],
    ['Monday', ['2026-10-12', '2026-10-05']],
    ['this Friday', ['2026-10-09']],
    ['next Friday', ['2026-10-16']],
    ['last Friday', ['2026-10-02']],
    ['next week', ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']],
    ['Oct 22', ['2026-10-22', '2025-10-22']],
    ['October 2', ['2027-10-02', '2026-10-02']],
    ['Oct 8', ['2026-10-08', '2025-10-08']],
    ['Feb 29', ['2028-02-29', '2024-02-29']],
    ['in 3 days', ['2026-10-11']],
    ['3 days ago', ['2026-10-05']],
    ['in 12 days', ['2026-10-20']],
    ['12 days ago', ['2026-09-26']],
    ['in 1 day', ['2026-10-09']],
    ['1 day ago', ['2026-10-07']],
    ['in 0 days', ['2026-10-08']],
    ['0 days ago', ['2026-10-08']],
    ['two days ago', ['2026-10-06']],
    ['in five days', ['2026-10-13']],
    ['in twenty-five days', ['2026-11-02']],
    ['twenty five days ago', ['2026-09-13']],
    ['in one hundred days', ['2027-01-16']],
    ['ONE   HUNDRED days ago', ['2026-06-30']],
    ['NEXT   FRIDAY', ['2026-10-16']],
    ['May 1', ['2027-05-01', '2026-05-01']],
  ])('%s gives the ordered dates', (expression, expected) => {
    expect(dates(expression)).toEqual(expected)
  })

  it.each([
    't',
    'to',
    'tomo',
    'mar',
    'may',
    'Fri',
    'next',
    'Oct',
    'Oct 32',
    'Feb 30',
    '2026-10-08',
    '2026-02-31',
    'tomorrowland',
    'atoday',
    'today2',
    '_today',
    'today_',
    'étoday',
    'todayé',
    '𐐀today',
    'today𐐀',
    'in 999999999999999999 days',
    'in 4000000 days',
    '4000000 days ago',
  ])('does not recognize %s', (expression) => {
    expect(dates(expression)).toBeUndefined()
  })

  it('orders bare weekdays according to the reference day', () => {
    expect(dates('Friday', day('2026-10-06'))).toEqual(['2026-10-09', '2026-10-16'])
    expect(dates('Friday', day('2026-10-10'))).toEqual(['2026-10-16', '2026-10-09'])
    expect(dates('Friday', day('2026-10-09'))).toEqual(['2026-10-09', '2026-10-16'])
  })

  it('recognizes every English count from one through one hundred like its digits', () => {
    const small = [
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten',
      'eleven',
      'twelve',
      'thirteen',
      'fourteen',
      'fifteen',
      'sixteen',
      'seventeen',
      'eighteen',
      'nineteen',
    ]
    const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
    for (let count = 1; count <= 100; count++) {
      const word =
        count === 100
          ? 'one hundred'
          : count < 20
            ? small[count - 1]!
            : tens[Math.floor(count / 10) - 2]! + (count % 10 ? ` ${small[(count % 10) - 1]}` : '')
      for (const spelling of [word, word.replace(' ', '-'), word.toUpperCase().replace(' ', '   ')]) {
        if (spelling === 'one-hundred') continue
        expect(dates(`in ${spelling} days`)).toEqual(dates(`in ${count} days`))
        expect(dates(`${spelling} days ago`)).toEqual(dates(`${count} days ago`))
      }
    }
    expect(dates('in one day')).toEqual(dates('in 1 day'))
    expect(dates('one day ago')).toEqual(dates('1 day ago'))
  })

  it('keeps word counts within expression boundaries and calendar bounds', () => {
    for (const text of [
      'in zero days',
      'in one hundred one days',
      'in twentyfive days',
      'in twohundred days',
      'in twenty--five days',
      'in twoday',
      'in fivedays',
      'two days agone',
    ]) {
      expect(dates(text)).toBeUndefined()
    }
    const text = 'Plan in TWENTY   FIVE days at noon'
    const match = suggestDates(text, 15, today)!
    expect(text.slice(match.start, match.end)).toBe('in TWENTY   FIVE days')
    expect(match.suggestions).toEqual([{ day: today + 25, expression: 'in twenty five days' }])
    expect(dates('one day ago', day('0000-01-01'))).toBeUndefined()
    expect(dates('in one day', day('9999-12-31'))).toBeUndefined()
  })

  it.each(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])(
    'uses Monday-based weeks for %s',
    (name) => {
      const index = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(name)
      for (const [qualifier, offset] of [
        ['this', 0],
        ['next', 7],
        ['last', -7],
      ] as const) {
        expect(suggestDates(`${qualifier} ${name}`, `${qualifier} ${name}`.length, today)?.suggestions[0]?.day).toBe(
          day('2026-10-05') + index + offset,
        )
      }
    },
  )

  it.each(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])(
    'recognizes %s with a day',
    (month) => {
      expect(dates(`${month} 1`)).toHaveLength(2)
    },
  )

  it('returns only the expression span, including its original spacing and case', () => {
    const text = 'Plan NEXT   Friday at 10, tomorrow morning'
    const match = suggestDates(text, 10, today)!
    expect(match.start).toBe(5)
    expect(match.end).toBe(18)
    expect(match.suggestions).toEqual([{ day: day('2026-10-16'), expression: 'next friday' }])
    expect(text.slice(0, match.start) + '2026-10-16' + text.slice(match.end)).toBe(
      'Plan 2026-10-16 at 10, tomorrow morning',
    )
    expect(suggestDates(text, 30, today)?.start).toBe(26)
    expect(suggestDates(text, 23, today)).toBeUndefined()
  })

  it('recognizes expressions at both caret edges and leaves surrounding words alone', () => {
    for (let caret = 3; caret <= 11; caret++) {
      expect(suggestDates('🙂 tomorrow morning', caret, today)).toEqual({
        start: 3,
        end: 11,
        suggestions: [{ day: today + 1, expression: 'tomorrow' }],
      })
    }
    expect(suggestDates('🙂 tomorrow morning', 2, today)).toBeUndefined()
    expect(suggestDates('🙂 tomorrow morning', 12, today)).toBeUndefined()
    expect(suggestDates('(today)', 6, today)?.start).toBe(1)
    expect(suggestDates('tomor', 5, today)?.suggestions[0]?.expression).toBe('tomorrow')
    expect(suggestDates('tomorr', 6, today)?.suggestions[0]?.expression).toBe('tomorrow')
    expect(suggestDates('tomorro', 7, today)?.suggestions[0]?.expression).toBe('tomorrow')
    expect(suggestDates('today', 0, today)?.start).toBe(0)
  })

  it('rejects invalid caret offsets and calendar references', () => {
    for (const caret of [-1, 6, 0.5, NaN]) expect(suggestDates('today', caret, today)).toBeUndefined()
    expect(() => suggestDates('today', 5, NaN)).toThrow(RangeError)
  })

  it('keeps suggestions inside the canonical calendar at its boundaries', () => {
    const first = day('0000-01-01')
    const last = day('9999-12-31')
    expect(dates('yesterday', first)).toBeUndefined()
    expect(dates('tomorrow', last)).toBeUndefined()
    expect(dates('Jan 1', first)).toEqual(['0000-01-01'])
    expect(dates('Jan 1', last)).toEqual(['9999-01-01'])
    expect(dates('Dec 31', last)).toEqual(['9999-12-31', '9998-12-31'])
    expect(dates('today', first)).toEqual(['0000-01-01'])
    expect(dates('today', last)).toEqual(['9999-12-31'])
  })

  it('initializes the canonical limits correctly on a fresh module load', async () => {
    vi.resetModules()
    const { suggestDates: freshSuggestDates } = await import('./natural-date')
    for (const value of ['0000-01-01', '9999-12-31']) {
      expect(freshSuggestDates('today', 5, day(value))?.suggestions[0]?.day).toBe(day(value))
    }
  })
})
