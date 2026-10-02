export const WINDOWING_THRESHOLD = 500
export const WINDOW_OVERSCAN = 12
export const ROW_HEIGHT_ESTIMATE = 25
export const EDGE_SCROLL_MARGIN = 64
export const EDGE_SCROLL_STEP = 14

export interface ListOffsets {
  offsets: Float64Array
  total: number
}

export interface ListWindow {
  start: number
  end: number
  pinnedIndex: number | undefined
}

export interface ListWindowOptions {
  count: number
  offsets: ArrayLike<number>
  viewportStart: number
  viewportEnd: number
  overscan: number
  focusedIndex: number | undefined
}

export function shouldWindow(count: number): boolean {
  return count > WINDOWING_THRESHOLD
}

export function autoScrollStep(clientY: number, viewportHeight: number): number {
  if (clientY < EDGE_SCROLL_MARGIN) return -EDGE_SCROLL_STEP
  if (clientY > viewportHeight - EDGE_SCROLL_MARGIN) return EDGE_SCROLL_STEP
  return 0
}

export function computeOffsets(heights: readonly number[]): ListOffsets {
  const offsets = new Float64Array(heights.length + 1)
  let total = 0
  for (let index = 0; index < heights.length; index += 1) {
    total += heights[index]!
    offsets[index + 1] = total
  }
  return { offsets, total }
}

export function computeListWindow({
  count,
  offsets,
  viewportStart,
  viewportEnd,
  overscan,
  focusedIndex,
}: ListWindowOptions): ListWindow {
  // Mutation triage: for an empty list the code below also yields `{ start: 0, end: 0 }` with no pinned
  // row, and the binary searches never return more than `count`, so the upper clamp bounds are redundant.
  if (count <= 0) return { start: 0, end: 0, pinnedIndex: undefined }
  const clampedStart = Math.max(0, viewportStart)
  const clampedEnd = Math.max(0, viewportEnd)
  const firstVisible = clamp(upperBound(offsets, count, clampedStart) - 1, 0, count - 1)
  const lastVisible = clamp(lowerBound(offsets, count, clampedEnd) - 1, 0, count - 1)
  const start = Math.max(0, firstVisible - overscan)
  const end = Math.min(count, lastVisible + 1 + overscan)
  // Mutation triage: `undefined >= 0` is false, so the explicit `undefined` check is redundant.
  const pinnedIndex =
    focusedIndex !== undefined &&
    focusedIndex >= 0 &&
    focusedIndex < count &&
    (focusedIndex < start || focusedIndex >= end)
      ? focusedIndex
      : undefined
  return { start, end, pinnedIndex }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function lowerBound(offsets: ArrayLike<number>, count: number, target: number): number {
  let low = 0
  let high = count
  while (low < high) {
    const middle = (low + high) >>> 1
    if (offsets[middle]! < target) low = middle + 1
    else high = middle
  }
  return low
}

function upperBound(offsets: ArrayLike<number>, count: number, target: number): number {
  let low = 0
  let high = count
  while (low < high) {
    const middle = (low + high) >>> 1
    if (offsets[middle]! <= target) low = middle + 1
    else high = middle
  }
  return low
}
