import { describe, expect, it } from 'vitest'
import type { NodeResult } from '../application/node-result'
import { hasGroupHeading } from './global-search-session'
import { computeSearchResultWindow } from './search-result-window'

const rows: readonly NodeResult[] = Array.from({ length: 60 }, (_, index) => ({
  id: `result-${index}`,
  text: '',
  path: null,
  attachment: { id: `image-${index}` },
}))
const offsetAt = (index: number): number => index * 75

describe('Search thumbnail window', () => {
  it.each([
    [11, 6, 18],
    [12, 8, 18],
    [15, 8, 20],
  ])('adds a bounded lead only near the selected edge at row %i', (selected, start, end) => {
    const window = computeSearchResultWindow(rows, offsetAt, 750, 450, selected)

    expect(window).toEqual({ start, end, pinnedIndex: undefined })
  })

  it('does not add initial reads or expand a window of text-only results', () => {
    const textRows = rows.map(({ id, text, path }) => ({ id, text, path }))

    expect(computeSearchResultWindow(rows, offsetAt, 0, 150, 0)).toEqual({
      start: 0,
      end: 4,
      pinnedIndex: undefined,
    })
    expect(computeSearchResultWindow(textRows, offsetAt, 750, 450, 15)).toEqual({
      start: 8,
      end: 18,
      pinnedIndex: undefined,
    })
  })

  it('leaves room for group headings and a selection pinned outside the viewport', () => {
    const grouped = rows.map((row, index) => ({ ...row, path: 'Group', parentId: `p-${index}` }))
    const visible = computeSearchResultWindow(grouped, offsetAt, 750, 75 * 17, 26)
    const pinned = computeSearchResultWindow(grouped, offsetAt, 750, 75 * 17, 0)
    const countOptions = ({ start, end, pinnedIndex }: typeof visible): number => {
      const indices = Array.from({ length: end - start }, (_, index) => start + index)
      if (pinnedIndex !== undefined) indices.push(pinnedIndex)
      return indices.reduce((count, index) => count + (hasGroupHeading(grouped, index) ? 2 : 1), 0)
    }

    expect(visible.start).toBeLessThanOrEqual(10)
    expect(visible.end).toBeGreaterThanOrEqual(27)
    expect(pinned.pinnedIndex).toBe(0)
    expect(countOptions(visible)).toBe(40)
    expect(countOptions(pinned)).toBe(40)
  })
})
