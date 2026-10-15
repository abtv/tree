import { expect, it } from 'vitest'
import fc from 'fast-check'
import { propertyRuns } from '../test/property-runs'
import { dayNumberOf } from '../domain/calendar-date'
import { DateAssist } from './date-assist'

// @requirement PRODUCT.md §20.12
it('retains literal emoji fragments and bounds selection across arbitrary popup navigation', () => {
  fc.assert(
    fc.property(fc.constantFrom(':roc', ':ma', ':woman_techn'), fc.array(fc.constantFrom(-1, 1)), (text, commands) => {
      const assist = new DateAssist()
      assist.edit('n', text, text.length, dayNumberOf({ year: 2026, month: 10, day: 8 }), [])
      const count = assist.popup!.suggestions.length
      let selected = 0
      for (const direction of commands) {
        assist.move(direction as -1 | 1)
        selected = (selected + direction + count) % count
        expect(assist.popup).toMatchObject({ text, start: 0, end: text.length, selected })
      }
      assist.close()
      assist.observe('n', text, text.length, text.length, true)
      expect(assist.popup).toBeUndefined()
    }),
    { numRuns: propertyRuns(500) },
  )
})

// @requirement PRODUCT.md §20.9
it('never reopens a dismissed popup through arbitrary observation and navigation sequences', () => {
  fc.assert(
    fc.property(fc.array(fc.integer({ min: -1, max: 1 })), (commands) => {
      const assist = new DateAssist()
      const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
      assist.edit('n', 'Friday', 6, today, [])
      let selected = 0
      for (const direction of commands) {
        if (direction === 0) assist.observe('n', 'Friday', 6, 6, true)
        else {
          assist.move(direction as -1 | 1)
          selected = (selected + direction + 2) % 2
        }
        expect(assist.popup?.selected).toBe(selected)
      }
      assist.close()
      for (const direction of commands) {
        if (direction === 0) assist.observe('n', 'Friday', 6, 6, true)
        else assist.move(direction as -1 | 1)
        expect(assist.popup).toBeUndefined()
      }
    }),
    { numRuns: propertyRuns(500) },
  )
})

// @requirement PRODUCT.md §20.9
it('retains the selected week date through arbitrary refinement and navigation', () => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom(-1, 1)), (commands) => {
      const assist = new DateAssist()
      const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
      assist.edit('n', 'next wee', 8, today, [])
      for (const direction of commands) {
        assist.move(direction as -1 | 1)
        const selected = assist.popup!.suggestions[assist.popup!.selected]!
        for (const text of ['next week', 'NEXT   WEEK', 'next wee']) {
          assist.edit('n', text, text.length, today, [])
          expect(assist.popup!.suggestions[assist.popup!.selected]).toEqual(selected)
        }
      }
    }),
    { numRuns: propertyRuns(500) },
  )
})
