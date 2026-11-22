import type { NodeResult } from '../application/node-result'
import { hasGroupHeading } from './global-search-session'
import { computeListWindow, type ListWindow } from './list-window'

const MOUNTED_ROW_LIMIT = 40
const OVERSCAN_ENTRIES = 2

// Allow one extra partially intersecting row, the clipped partner at each edge,
// and both options of a selected entry pinned outside the rendered range.
export const SEARCH_RESULT_VIEWPORT_ROWS = MOUNTED_ROW_LIMIT - 1 - 2 - 2

export function computeSearchResultWindow(
  items: readonly NodeResult[],
  offsets: ArrayLike<number>,
  viewportStart: number,
  viewportHeight: number,
  selected: number,
): ListWindow {
  const visible = computeListWindow({
    count: items.length,
    offsets,
    viewportStart,
    viewportEnd: viewportStart + viewportHeight,
    overscan: 0,
    focusedIndex: selected,
  })
  const optionCount = (index: number): number => (hasGroupHeading(items, index) ? 2 : 1)
  const pin = visible.pinnedIndex
  let remaining = MOUNTED_ROW_LIMIT - (pin === undefined ? 0 : optionCount(pin))
  for (let index = visible.start; index < visible.end; index++) remaining -= optionCount(index)

  let { start, end } = visible
  // Grow both edges from nearest to farthest. The selected entry already has a reservation.
  for (let distance = 0; distance < OVERSCAN_ENTRIES; distance++) {
    if (start > 0) {
      const cost = start - 1 === pin ? 0 : optionCount(start - 1)
      if (cost <= remaining) {
        start--
        remaining -= cost
      }
    }
    if (end < items.length) {
      const cost = end === pin ? 0 : optionCount(end)
      if (cost <= remaining) {
        end++
        remaining -= cost
      }
    }
  }
  const pinnedIndex = pin !== undefined && (pin < start || pin >= end) ? pin : undefined
  return { start, end, pinnedIndex }
}
