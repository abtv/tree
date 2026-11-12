import fc from 'fast-check'
import { expect, it } from 'vitest'
import { buildLayout } from './node-list-layout'
import { computeOffsets, ROW_HEIGHT_ESTIMATE } from './list-window'
import { propertyRuns } from '../test/property-runs'

// @requirement PRODUCT.md §23.6
// @requirement PRODUCT.md §20.8
it('matches cumulative row heights through changed measurements and reordered projections', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.option(
          fc.integer({ min: 1, max: 2000 }).map((value) => value / 8),
          { nil: undefined },
        ),
        {
          maxLength: 300,
        },
      ),
      (values) => {
        const rows = values.map((_, index) => ({ key: `row-${index}` }))
        const heights = new Map<string, number>([['missing', 90]])
        values.forEach((height, index) => {
          if (height !== undefined) heights.set(rows[index]!.key, height)
        })
        const initial = buildLayout(rows, new Map())

        for (const projection of [rows, rows.toReversed()]) {
          const expected = computeOffsets(projection.map((row) => heights.get(row.key) ?? ROW_HEIGHT_ESTIMATE))
          const actual = buildLayout(projection, heights)

          expect([...actual.offsets]).toEqual([...expected.offsets])
          expect(actual.total).toBe(expected.total)
          expect(actual.count).toBe(projection.length)
        }

        heights.clear()
        if (rows.length > 0) heights.set(rows[0]!.key, 80)
        const changed = buildLayout(rows, heights)

        expect(changed.total).toBe(rows.length === 0 ? 0 : (rows.length - 1) * ROW_HEIGHT_ESTIMATE + 80)
        expect(buildLayout(rows, new Map())).toEqual(initial)
        expect(initial.total).toBe(rows.length * ROW_HEIGHT_ESTIMATE)
      },
    ),
    { numRuns: propertyRuns(150) },
  )
})
