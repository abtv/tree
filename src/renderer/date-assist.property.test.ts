import { expect, it } from 'vitest'
import fc from 'fast-check'
import { propertyRuns } from '../test/property-runs'
import { dayNumberOf } from '../domain/calendar-date'
import { DateAssist } from './date-assist'

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
