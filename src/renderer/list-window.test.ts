import { describe, expect, it } from 'vitest'
import {
  computeListWindow,
  computeOffsets,
  ROW_HEIGHT_ESTIMATE,
  shouldWindow,
  WINDOW_OVERSCAN,
  WINDOWING_THRESHOLD,
} from './list-window'

const uniform = (count: number, height = ROW_HEIGHT_ESTIMATE): number[] => Array.from({ length: count }, () => height)

describe('shouldWindow', () => {
  it('windows only above the threshold', () => {
    expect(shouldWindow(WINDOWING_THRESHOLD)).toBe(false)
    expect(shouldWindow(WINDOWING_THRESHOLD + 1)).toBe(true)
  })
})

describe('computeOffsets', () => {
  it('accumulates variable row heights', () => {
    const { offsets, total } = computeOffsets([27, 54, 27])
    expect(Array.from(offsets)).toEqual([0, 27, 81, 108])
    expect(total).toBe(108)
  })

  it('handles an empty list', () => {
    const { offsets, total } = computeOffsets([])
    expect(Array.from(offsets)).toEqual([0])
    expect(total).toBe(0)
  })
})

describe('computeListWindow', () => {
  it('returns an empty window for an empty list', () => {
    const offsets = computeOffsets([]).offsets
    expect(
      computeListWindow({
        count: 0,
        offsets,
        viewportStart: 0,
        viewportEnd: 500,
        overscan: 0,
        focusedIndex: undefined,
      }),
    ).toEqual({ start: 0, end: 0, pinnedIndex: undefined })
  })

  it('selects only rows intersecting the viewport without overscan', () => {
    const offsets = computeOffsets(uniform(100)).offsets
    const window = computeListWindow({
      count: 100,
      offsets,
      viewportStart: 27 * 10,
      viewportEnd: 27 * 12,
      overscan: 0,
      focusedIndex: undefined,
    })
    expect(window.start).toBe(10)
    expect(window.end).toBe(12)
  })

  it('extends the window by the overscan on both sides', () => {
    const offsets = computeOffsets(uniform(100)).offsets
    const window = computeListWindow({
      count: 100,
      offsets,
      viewportStart: 27 * 20,
      viewportEnd: 27 * 21,
      overscan: WINDOW_OVERSCAN,
      focusedIndex: undefined,
    })
    expect(window.start).toBe(20 - WINDOW_OVERSCAN)
    expect(window.end).toBe(21 + WINDOW_OVERSCAN)
  })

  it('clamps the window to the list bounds', () => {
    const offsets = computeOffsets(uniform(100)).offsets
    const top = computeListWindow({
      count: 100,
      offsets,
      viewportStart: 0,
      viewportEnd: 5,
      overscan: WINDOW_OVERSCAN,
      focusedIndex: undefined,
    })
    expect(top.start).toBe(0)
    expect(top.end).toBe(1 + WINDOW_OVERSCAN)

    const bottom = computeListWindow({
      count: 100,
      offsets,
      viewportStart: 27 * 98,
      viewportEnd: 27 * 100,
      overscan: WINDOW_OVERSCAN,
      focusedIndex: undefined,
    })
    expect(bottom.start).toBe(98 - WINDOW_OVERSCAN)
    expect(bottom.end).toBe(100)
  })

  it('keeps the last row visible when the viewport passes the end', () => {
    const offsets = computeOffsets(uniform(10)).offsets
    const window = computeListWindow({
      count: 10,
      offsets,
      viewportStart: 1_000,
      viewportEnd: 2_000,
      overscan: 0,
      focusedIndex: undefined,
    })
    expect(window.start).toBe(9)
    expect(window.end).toBe(10)
  })

  it('handles variable heights using the accumulated offsets', () => {
    const heights = [100, 50, 50, 200, 27, 27]
    const { offsets } = computeOffsets(heights)
    const window = computeListWindow({
      count: heights.length,
      offsets,
      viewportStart: 150,
      viewportEnd: 250,
      overscan: 0,
      focusedIndex: undefined,
    })
    expect(window.start).toBe(2)
    expect(window.end).toBe(4)
  })

  it('treats a viewport above the list as the start of the list', () => {
    const offsets = computeOffsets(uniform(600)).offsets
    const window = computeListWindow({
      count: 600,
      offsets,
      viewportStart: 0,
      viewportEnd: 0,
      overscan: 2,
      focusedIndex: undefined,
    })
    expect(window.start).toBe(0)
    expect(window.end).toBe(3)
  })

  it('pins a focused row outside the window and leaves an inside focus alone', () => {
    const offsets = computeOffsets(uniform(600)).offsets
    const outside = computeListWindow({
      count: 600,
      offsets,
      viewportStart: 0,
      viewportEnd: 100,
      overscan: 0,
      focusedIndex: 500,
    })
    expect(outside.pinnedIndex).toBe(500)

    const inside = computeListWindow({
      count: 600,
      offsets,
      viewportStart: 0,
      viewportEnd: 100,
      overscan: 0,
      focusedIndex: 1,
    })
    expect(inside.pinnedIndex).toBeUndefined()
  })

  it('ignores an out-of-range focused index', () => {
    const offsets = computeOffsets(uniform(600)).offsets
    for (const focusedIndex of [-1, 600, 10_000]) {
      const window = computeListWindow({
        count: 600,
        offsets,
        viewportStart: 0,
        viewportEnd: 100,
        overscan: 0,
        focusedIndex,
      })
      expect(window.pinnedIndex).toBeUndefined()
    }
  })

  it('covers every row intersecting the viewport', () => {
    const heights = Array.from({ length: 200 }, (_, index) => (index % 7 === 0 ? 81 : 27))
    const { offsets } = computeOffsets(heights)
    for (let viewportStart = 0; viewportStart < 4_000; viewportStart += 97) {
      const viewportEnd = viewportStart + 640
      const window = computeListWindow({
        count: heights.length,
        offsets,
        viewportStart,
        viewportEnd,
        overscan: 0,
        focusedIndex: undefined,
      })
      let top = 0
      for (let index = 0; index < heights.length; index += 1) {
        const bottom = top + heights[index]!
        const intersects = top < viewportEnd && bottom > viewportStart
        if (intersects) {
          expect(index).toBeGreaterThanOrEqual(window.start)
          expect(index).toBeLessThan(window.end)
        }
        top = bottom
      }
    }
  })
})
