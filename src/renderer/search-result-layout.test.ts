import { expect, it } from 'vitest'
import fc from 'fast-check'
import { computeListWindow, computeOffsets } from './list-window'
import { SearchResultLayout } from './search-result-layout'

it('keeps previous layouts and updates the last row across block boundaries', () => {
  const base = SearchResultLayout.estimate(257, () => 25)
  const measured = base.withMeasurements(
    new Map([
      [127, 70],
      [128, 40],
      [256, 60],
    ]),
  )
  const restored = measured.withMeasurements(
    new Map([
      [127, 25],
      [256, 25],
    ]),
  )

  expect(base.total).toBe(6425)
  expect(measured.offsetAt(128)).toBe(3245)
  expect(measured.offsetAt(129)).toBe(3285)
  expect(measured.total).toBe(6520)
  expect(restored.total).toBe(6440)
  expect(restored.withMeasurements(new Map([[128, 40]]))).toBe(restored)
})

it('agrees with full recomputation for successive batches of varying measured heights', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 400 }), { minLength: 129, maxLength: 530 }),
      fc.array(fc.array(fc.tuple(fc.nat(999), fc.integer({ min: 1, max: 600 })), { maxLength: 20 }), { maxLength: 10 }),
      fc.nat(50_000),
      (heights, batches, target) => {
        let layout = SearchResultLayout.estimate(heights.length, (index) => heights[index]!)
        const current = heights.slice()
        for (const entries of batches) {
          const changes = new Map(entries.map(([index, height]) => [index % current.length, height]))
          for (const [index, height] of changes) current[index] = height
          layout = layout.withMeasurements(changes)
          const expected = computeOffsets(current).offsets
          expect(Array.from({ length: current.length + 1 }, (_, index) => layout.offsetAt(index))).toEqual([
            ...expected,
          ])
          const viewport = {
            count: current.length,
            viewportStart: target,
            viewportEnd: target + 200,
            overscan: 2,
            focusedIndex: 0,
          }
          expect(computeListWindow({ ...viewport, offsets: layout.offsetAt })).toEqual(
            computeListWindow({ ...viewport, offsets: expected }),
          )
        }
      },
    ),
  )
})
