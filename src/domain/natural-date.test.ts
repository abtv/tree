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

// @requirement PRODUCT.md §20.9.1
it('agrees relative day and week descriptions with numeric and written counts', () => {
  for (const [count, singular] of [
    ['0', false],
    ['1', true],
    ['01', true],
    ['2', false],
    ['one', true],
    ['two', false],
    ['twenty-one', false],
    ['one hundred', false],
  ] as const) {
    for (const unit of ['day', 'week']) {
      for (const suffix of ['', 's']) {
        for (const past of [false, true]) {
          const input = past ? `${count} ${unit}${suffix} ago` : `in ${count} ${unit}${suffix}`
          const agreedUnit = `${unit}${singular ? '' : 's'}`
          const expected = past ? `${count} ${agreedUnit} ago` : `in ${count} ${agreedUnit}`
          for (const prefix of ['', 'Plan ']) {
            const text = prefix + input

            const result = suggestDates(text, text.length, today)!

            expect(result.suggestions[0]!.expression, text).toBe(expected)
            expect(text.slice(result.start, result.end)).toBe(input)
            expect(dates(text)).toEqual(dates(expected))
          }
        }
      }
    }
  }
})

// @requirement PRODUCT.md §20.9.2
describe('adjacent calendar months', () => {
  // @requirement PRODUCT.md §20.9.1
  it('shows both interpretations for mon and disambiguates at mond or mont', () => {
    for (const qualifier of ['next', 'last']) {
      const text = `${qualifier} mon`

      const result = suggestDates(text, text.length, day('2026-10-17'))!
      const weekday = `${qualifier} monday`
      const month = `${qualifier} month`

      expect(result.suggestions).toHaveLength(4)
      expect(result.suggestions.filter(({ expression }) => expression === weekday)).toHaveLength(1)
      expect(result.suggestions.filter(({ expression }) => expression === month)).toHaveLength(3)
      expect(result.suggestions[0]!.day).toBe(day(qualifier === 'next' ? '2026-10-19' : '2026-10-05'))
      expect(dates(`${qualifier} mond`)).toEqual(dates(weekday))
      expect(dates(`${qualifier} mont`)).toEqual(dates(month))

      const spaced = `Plan ${qualifier.toUpperCase()}   MON at noon`
      const match = suggestDates(spaced, spaced.indexOf(' at noon'), today)!

      expect(spaced.slice(match.start, match.end)).toBe(`${qualifier.toUpperCase()}   MON`)
      expect(match.suggestions).toHaveLength(4)
    }

    expect(suggestDates('next mon', 8, day('2026-10-31'))!.suggestions[0]!.expression).toBe('next month')
    expect(suggestDates('last mon', 8, day('2026-10-02'))!.suggestions[0]!.expression).toBe('last month')
  })

  it('keeps both labels when Monday is also a month anchor', () => {
    for (const [text, reference, sharedDay] of [
      ['next mon', '2026-05-25', '2026-06-01'],
      ['last mon', '2024-10-07', '2024-09-30'],
    ]) {
      const result = suggestDates(text!, text!.length, day(reference!))!

      expect(result.suggestions).toHaveLength(4)
      expect(
        result.suggestions.filter(({ day: value }) => value === day(sharedDay!)).map(({ expression }) => expression),
      ).toEqual([text!.replace('mon', 'monday'), text!.replace('mon', 'month')])
    }
  })

  it.each([
    ['next month', '2026-10-17', ['2026-11-01', '2026-11-15', '2026-11-30']],
    ['last month', '2026-10-17', ['2026-09-30', '2026-09-15', '2026-09-01']],
    ['next month', '2026-12-31', ['2027-01-01', '2027-01-15', '2027-01-31']],
    ['last month', '2026-01-01', ['2025-12-31', '2025-12-15', '2025-12-01']],
    ['next month', '2028-01-31', ['2028-02-01', '2028-02-15', '2028-02-29']],
    ['last month', '2028-03-01', ['2028-02-29', '2028-02-15', '2028-02-01']],
    ['next month', '2027-01-15', ['2027-02-01', '2027-02-15', '2027-02-28']],
    ['last month', '2027-05-31', ['2027-04-30', '2027-04-15', '2027-04-01']],
    ['next month', '0000-01-01', ['0000-02-01', '0000-02-15', '0000-02-29']],
    ['last month', '9999-12-31', ['9999-11-30', '9999-11-15', '9999-11-01']],
  ] as const)('%s at %s prefers the nearest month anchor', (text, reference, expected) => {
    expect(dates(text, day(reference))).toEqual(expected)
  })

  it('omits a month outside the canonical calendar', () => {
    expect(dates('last month', day('0000-01-01'))).toBeUndefined()
    expect(dates('next month', day('9999-12-31'))).toBeUndefined()
  })

  it('recognizes full month expressions with case, spacing and exact replacement boundaries', () => {
    const text = 'Plan LAST   MONTH at noon'
    const match = suggestDates(text, 17, today)!

    expect(text.slice(match.start, match.end)).toBe('LAST   MONTH')
    expect(match.suggestions.every(({ expression }) => expression === 'last month')).toBe(true)
    expect(dates('next months')).toBeUndefined()
    expect(dates('last monthly')).toBeUndefined()
    expect(dates('anext month')).toBeUndefined()
  })
})

describe('natural date expression table proposed in AG-22', () => {
  it.each([
    ['toda', ['2026-10-08']],
    ['today', ['2026-10-08']],
    ['tomo', ['2026-10-09']],
    ['tomor', ['2026-10-09']],
    ['tomorr', ['2026-10-09']],
    ['tomorro', ['2026-10-09']],
    ['tomorrow', ['2026-10-09']],
    ['yesterday', ['2026-10-07']],
    ['yest', ['2026-10-07']],
    ['yeste', ['2026-10-07']],
    ['yester', ['2026-10-07']],
    ['yesterd', ['2026-10-07']],
    ['yesterda', ['2026-10-07']],
    ['Friday', ['2026-10-09', '2026-10-16']],
    ['Monday', ['2026-10-12', '2026-10-05']],
    ['this Friday', ['2026-10-09']],
    ['next Friday', ['2026-10-16']],
    ['last Friday', ['2026-10-02']],
    ['next week', ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']],
    ['next wee', ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']],
    ['last wee', ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']],
    ['last week', ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']],
    ['Oct 22', ['2026-10-22', '2025-10-22']],
    ['October 2', ['2027-10-02', '2026-10-02']],
    ['Oct 8', ['2026-10-08', '2025-10-08']],
    ['Feb 29', ['2028-02-29', '2024-02-29']],
    ['in 3 days', ['2026-10-11']],
    ['in 3 weeks', ['2026-10-29']],
    ['3 weeks ago', ['2026-09-17']],
    ['three weeks ago', ['2026-09-17']],
    ['in one week', ['2026-10-15']],
    ['twenty-five weeks ago', ['2026-04-16']],
    ['in 0 weeks', ['2026-10-08']],
    ['in October', ['2026-10-15']],
    ['last October', ['2026-10-01']],
    ['IN   NOVEMBER', ['2026-11-01', '2025-11-01']],
    ['in September', ['2027-09-01', '2026-09-01']],
    ['last January', ['2026-01-01']],
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
    'tod',
    'tom',
    'yes',
    'yes, please',
    'toddler',
    'tomography',
    'yesteryear',
    'next w',
    'last w',
    'next winter',
    'last winter',
    'next weekend',
    'last weekend',
    'mar',
    'may',
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

  it('uses month starts outside the current month, including calendar boundaries', () => {
    expect(dates('in October', day('2026-09-30'))).toEqual(['2026-10-01', '2025-10-01'])
    expect(dates('in October', day('2026-10-01'))).toEqual(['2026-10-15'])
    expect(dates('last October', day('2026-10-01'))).toEqual(['2025-10-01'])
    expect(dates('in January', day('9999-12-31'))).toEqual(['9999-01-01'])
    expect(dates('in February', day('0000-01-01'))).toEqual(['0000-02-01'])
    expect(dates('last January', day('0000-01-01'))).toBeUndefined()
    expect(dates('in 1 week', day('9999-12-31'))).toBeUndefined()
    expect(dates('1 week ago', day('0000-01-01'))).toBeUndefined()

    for (const expression of ['in October', 'last October', 'in three weeks', 'three weeks ago']) {
      const text = `Plan ${expression} at noon`
      const match = suggestDates(text, 5 + expression.length, today)!

      expect(text.slice(match.start, match.end)).toBe(expression)
      expect(suggestDates(`${expression}suffix`, expression.length, today)).toBeUndefined()
    }
  })

  it('offers the fifteenth through the tenth, then the last day of the current month', () => {
    for (const date of ['01', '09', '10']) {
      expect(dates('in October', day(`2026-10-${date}`))).toEqual(['2026-10-15'])
    }
    for (const date of ['11', '15', '30', '31']) {
      expect(dates('in October', day(`2026-10-${date}`))).toEqual(['2026-10-31'])
    }
    expect(dates('in February', day('2028-02-10'))).toEqual(['2028-02-15'])
    expect(dates('in February', day('2028-02-11'))).toEqual(['2028-02-29'])
    expect(dates('in February', day('2027-02-11'))).toEqual(['2027-02-28'])
    expect(dates('in April', day('2026-04-11'))).toEqual(['2026-04-30'])
    expect(dates('in December', day('9999-12-31'))).toEqual(['9999-12-31'])
    expect(dates('in October', day('2026-11-01'))).toEqual(['2027-10-01', '2026-10-01'])
    expect(dates('last October', day('2026-10-11'))).toEqual(['2026-10-01'])
  })

  it('offers the end of the current named month before rolling into the next year', () => {
    for (const reference of ['2026-10-01', '2026-10-08', '2026-10-31']) {
      expect(dates('in the end of October', day(reference))).toEqual(['2026-10-31'])
    }
    expect(dates('in the end of October', day('2026-11-01'))).toEqual(['2027-10-31'])
    expect(dates('in the end of April')).toEqual(['2027-04-30'])
    expect(dates('in the end of February', day('2028-02-10'))).toEqual(['2028-02-29'])
    expect(dates('in the end of February', day('2027-02-10'))).toEqual(['2027-02-28'])
    expect(dates('in the end of December', day('9999-12-31'))).toEqual(['9999-12-31'])
    expect(dates('in the end of October', day('9999-11-01'))).toBeUndefined()

    const text = 'Plan IN   THE END OF OCTOBER at noon'
    const match = suggestDates(text, 27, today)!

    expect(text.slice(match.start, match.end)).toBe('IN   THE END OF OCTOBER')
    expect(match.suggestions).toEqual([{ day: day('2026-10-31'), expression: 'in the end of october' }])
    expect(dates('in the end of Oct')).toEqual(['2026-10-31'])
    expect(dates('in the end of Octobers')).toBeUndefined()
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
      'in twenty ten days',
      'in twenty eleven days',
      'in twenty five six days',
      'in twenty-five-six days',
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
    expect(dates('one day ago', day('0000-01-02'))).toEqual(['0000-01-01'])
    expect(dates('in one day', day('9999-12-30'))).toEqual(['9999-12-31'])
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

  it('completes every qualified month and weekday from three letters through its full name', () => {
    const groups = [
      {
        names: [
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
        ],
        qualifiers: ['in', 'last', 'in the end of'],
      },
      {
        names: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        qualifiers: ['this', 'next', 'last'],
      },
    ]
    for (const { names, qualifiers } of groups) {
      for (const name of names) {
        for (const qualifier of qualifiers) {
          const expression = `${qualifier} ${name}`
          for (let length = 3; length <= name.length; length++) {
            // The ambiguous next/last mon matrix is covered independently above.
            if (name === 'monday' && length === 3 && qualifier !== 'this') continue
            const fragment = `${qualifier} ${name.slice(0, length)}`

            expect(dates(fragment), fragment).toEqual(dates(expression))

            const text = `Plan (${fragment.toUpperCase().replaceAll(' ', '   ')}) at noon`
            const caret = text.indexOf(')')
            const match = suggestDates(text, caret, today)!

            expect(text.slice(match.start, match.end)).toBe(text.slice(6, caret))
            expect(match.suggestions.every((suggestion) => suggestion.expression === expression)).toBe(true)
            expect(dates(`${fragment}suffix`)).toBeUndefined()
          }

          expect(dates(`${qualifier} ${name.slice(0, 2)}`)).toBeUndefined()
        }
      }
    }
  })

  it('completes bare weekdays from three letters with the same dates as their full names', () => {
    for (const name of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
      for (let length = 3; length <= name.length; length++) {
        const fragment = name.slice(0, length)
        for (const prefix of ['', 'Plan ', 'beyond ', 'nearby ', 'on a ', 'by noon ', 'Plan on Monday then ']) {
          const text = `${prefix}${fragment.toUpperCase()} at noon`
          const match = suggestDates(text, prefix.length + fragment.length, today)!

          expect(match, text).toBeDefined()
          expect(match.start).toBe(prefix.length)
          expect(match.end).toBe(prefix.length + fragment.length)
          expect(match.suggestions).toEqual(suggestDates(name, name.length, today)!.suggestions)
        }

        expect(dates(fragment)).toEqual(dates(name))
        expect(dates(`${fragment}suffix`)).toBeUndefined()
        expect(dates(`prefix${fragment}`)).toBeUndefined()
      }

      expect(dates(name.slice(0, 2))).toBeUndefined()
    }
  })

  it('completes weekdays after on and by while preserving each preposition and surrounding text', () => {
    for (const name of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
      for (const preposition of ['on', 'by']) {
        for (let length = 3; length <= name.length; length++) {
          const fragment = name.slice(0, length)
          const text = `Plan ${preposition.toUpperCase()}   ${fragment.toUpperCase()} at noon`
          const start = text.indexOf(fragment.toUpperCase())
          const end = start + fragment.length
          const match = suggestDates(text, end, today)!

          expect(match, text).toBeDefined()
          expect(match.start).toBe(start)
          expect(match.end).toBe(end)
          expect(match.suggestions.map(({ day }) => formatCanonicalDate(calendarDateOf(day)))).toEqual(dates(name))
          expect(match.suggestions.every(({ expression }) => expression === name)).toBe(true)
          expect(text.slice(0, match.start) + 'DATE' + text.slice(match.end)).toBe(
            `Plan ${preposition.toUpperCase()}   DATE at noon`,
          )
        }

        expect(dates(`${preposition} ${name.slice(0, 2)}`)).toBeUndefined()
      }
    }

    expect(dates('beyond Friday')).toEqual(dates('Friday'))
    expect(dates('nearby Friday')).toEqual(dates('Friday'))

    for (const text of ['on fri', 'by fri']) {
      const match = suggestDates(text, text.length, today)!

      expect(match.start).toBe(3)
      expect(dates(text)).toEqual(dates('Friday'))
    }
  })

  it('keeps month/day completion available at every month prefix and preserves on and by', () => {
    const names = [
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
    for (const name of names) {
      for (let length = 3; length <= name.length; length++) {
        for (const preposition of ['', 'on ', 'by ']) {
          const fragment = `${name.slice(0, length)} 15`
          const text = `Plan ${preposition}${fragment} at noon`
          const match = suggestDates(text, 5 + preposition.length + fragment.length, today)!

          expect(match, text).toBeDefined()
          expect(text.slice(match.start, match.end)).toBe(fragment)
          expect(match.start).toBe(5 + preposition.length)
          expect(match.suggestions.map(({ day }) => formatCanonicalDate(calendarDateOf(day)))).toEqual(
            dates(`${name} 15`),
          )
          expect(match.suggestions.every(({ expression }) => expression === `${name} 15`)).toBe(true)
        }
      }
    }
  })

  it.each([
    'on fr',
    'by fr',
    'on fridays',
    'by fridayish',
    'se 15',
    'septembers 15',
    'septe 32',
    'febr 30',
    'next mondayundefined',
    'last septemberundefined',
  ])('rejects incomplete context and invalid continuations: %s', (text) => expect(dates(text)).toBeUndefined())

  it.each([
    'in s',
    'in j',
    'next f',
    'next t',
    'in se',
    'last oc',
    'this fr',
    'next tu',
    'in the end of se',
    'sep',
    'sept',
    'in septs',
    'next fridayish',
  ])('keeps uncertain or unrelated fragments silent: %s', (text) => expect(dates(text)).toBeUndefined())

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

  it('completes distinctive prefixes with full descriptions and exact replacement spans', () => {
    for (const [fragment, expression] of [
      ['TODA', 'today'],
      ['tomo', 'tomorrow'],
      ['yest', 'yesterday'],
      ['NEXT   WEE', 'next week'],
      ['last wee', 'last week'],
    ]) {
      const text = `Plan (${fragment}) at noon`
      const match = suggestDates(text, 6 + fragment!.length, today)!

      expect(text.slice(match.start, match.end)).toBe(fragment)
      expect(match.suggestions.every((suggestion) => suggestion.expression === expression)).toBe(true)
      expect(suggestDates(`${fragment}suffix`, fragment!.length, today)).toBeUndefined()
    }
    const text = 'Plan yesterday at noon'

    expect(suggestDates(text, 9, today)).toMatchObject({ start: 5, end: 14 })
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

  it('keeps a trailing newline outside a complete relative expression', () => {
    expect(suggestDates('two days ago\n', 12, today)).toEqual({
      start: 0,
      end: 12,
      suggestions: [{ day: today - 2, expression: 'two days ago' }],
    })
    expect(suggestDates('two days ago\n', 13, today)).toBeUndefined()
  })

  it('finds numeric relative counts inside surrounding words and other expressions', () => {
    expect(dates('Plan 2 days ago')).toEqual(['2026-10-06'])
    expect(dates('in 2 days 3 days ago')).toEqual(['2026-10-05'])
    expect(dates('2 3 days ago')).toEqual(['2026-10-05'])
  })

  it('rejects invalid caret offsets and calendar references', () => {
    for (const caret of [-1, 6, 0.5, NaN]) expect(suggestDates('today', caret, today)).toBeUndefined()
    for (const caret of [-1, 13, 0.5, NaN]) expect(suggestDates('two days ago', caret, today)).toBeUndefined()
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
