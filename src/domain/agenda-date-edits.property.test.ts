import fc from 'fast-check'
import { expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { nextActiveDay } from './agenda-date-edits'

const days = fc.integer({ min: 0, max: 30000 })

it('selects the closest day and the earliest equal-distance candidate', () => {
  fc.assert(
    fc.property(fc.array(days), days, (remaining, previous) => {
      const expected = [...remaining].sort((a, b) => Math.abs(a - previous) - Math.abs(b - previous) || a - b)[0]

      expect(nextActiveDay(remaining, previous)).toBe(expected)
    }),
    { numRuns: propertyRuns(300) },
  )
})
