import type { NodeResult } from '../application/node-result'
import { hasGroupHeading } from './global-search-session'
import { computeListWindow, type ListWindow, type OffsetLookup } from './list-window'

const MOUNTED_ROW_LIMIT = 40
const OVERSCAN_ENTRIES = 2
const THUMBNAIL_OVERSCAN_ENTRIES = 4

// Allow one extra partially intersecting row, the clipped partner at each edge,
// and both options of a selected entry pinned outside the rendered range.
export const SEARCH_RESULT_VIEWPORT_ROWS = MOUNTED_ROW_LIMIT - 1 - 2 - 2

export function computeSearchResultWindow(
  items: readonly NodeResult[],
  offsets: OffsetLookup,
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
  let hasVisibleThumbnails = false
  for (let index = visible.start; index < visible.end; index++) {
    remaining -= optionCount(index)
    if (items[index]?.attachment !== undefined) hasVisibleThumbnails = true
  }

  // Let nearby images start decoding before the selection reaches a viewport edge.
  // Keep the initial result window unchanged. The end may include a partially visible entry.
  const nearStart = hasVisibleThumbnails && selected >= visible.start && selected <= visible.start + 1
  const nearEnd = hasVisibleThumbnails && selected > 0 && selected < visible.end && selected >= visible.end - 3
  const beforeLimit = nearStart ? THUMBNAIL_OVERSCAN_ENTRIES : OVERSCAN_ENTRIES
  const afterLimit = nearEnd ? THUMBNAIL_OVERSCAN_ENTRIES : OVERSCAN_ENTRIES
  const overscanLimit = Math.max(beforeLimit, afterLimit)

  let { start, end } = visible
  // Grow both edges from nearest to farthest. The selected entry already has a reservation.
  for (let distance = 0; distance < overscanLimit; distance++) {
    if (distance < beforeLimit && start > 0) {
      const cost = start - 1 === pin ? 0 : optionCount(start - 1)
      if (cost <= remaining) {
        start--
        remaining -= cost
      }
    }
    if (distance < afterLimit && end < items.length) {
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
