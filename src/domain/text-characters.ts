const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
let latestText: string | undefined
let latestBoundaries: readonly number[] = []

/** DOM and document offsets remain UTF-16; visible-character motions use these boundaries. */
export function characterBoundaries(text: string): readonly number[] {
  if (text === latestText) return latestBoundaries
  const boundaries = [0]
  for (const { index, segment } of segmenter.segment(text)) boundaries.push(index + segment.length)
  latestText = text
  latestBoundaries = boundaries
  return boundaries
}

export function characterStart(text: string, offset: number): number {
  const boundaries = characterBoundaries(text)
  const clamped = Math.max(0, Math.min(offset, Math.max(0, text.length - 1)))
  return boundaries[firstBoundaryAfter(boundaries, clamped) - 1] ?? 0
}

export function moveCharacterOffset(text: string, offset: number, direction: -1 | 1, count = 1): number {
  const boundaries = characterBoundaries(text)
  const after = firstBoundaryAfter(boundaries, offset)
  if (count === 0) return boundaries[after - 1] ?? 0
  const index = direction === 1 ? after : after - (boundaries[after - 1] === offset ? 2 : 1)
  if (index < 0 || index >= boundaries.length) return direction === 1 ? text.length : 0
  return boundaries[Math.max(0, Math.min(boundaries.length - 1, index + direction * (count - 1)))]!
}

/** Geometry queries repeatedly snap offsets within the same row; keep each lookup logarithmic. */
function firstBoundaryAfter(boundaries: readonly number[], offset: number): number {
  let low = 0
  let high = boundaries.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (boundaries[middle]! <= offset) low = middle + 1
    else high = middle
  }
  return low
}
