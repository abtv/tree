import { characterBoundaries } from '../domain/text-characters'

/** A character's box in any one coordinate space; the point given with it uses the same space. */
export interface CellBox {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * The character under a pointer, as Vim and Evil place the cursor: the character whose box contains
 * the point, otherwise the nearest character on the visual line at the point's height. A point above
 * or below the text uses the first or last visual line, and a point past the end of a visual line
 * selects its last character, so a click never lands on the character that starts the next line.
 * Characters are grapheme clusters, so a joined emoji is one cell. A line break is a cell only on a
 * line that holds nothing else, as an empty line is in Vim. Empty text has its one position, 0.
 *
 * `box` measures the character that starts at an offset. The search reads O(log n) boxes to find the
 * line and then the boxes of that line only, so its cost does not grow with the rest of the text.
 */
export function cellAtPoint(text: string, box: (offset: number) => CellBox, point: { x: number; y: number }): number {
  if (text.length === 0) return 0
  const starts = characterBoundaries(text).slice(0, -1)
  const lowerBound = (predicate: (index: number) => boolean): number => {
    let low = 0
    let high = starts.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (predicate(middle)) high = middle
      else low = middle + 1
    }
    return low
  }
  // Visual lines follow the logical order, so their bottoms never decrease along the text.
  const lineCell = Math.min(
    lowerBound((index) => box(starts[index]!).bottom > point.y),
    starts.length - 1,
  )
  const lineTop = box(starts[lineCell]!).top
  const lineStart = lowerBound((index) => box(starts[index]!).top >= lineTop - 1)
  const lineEnd = lowerBound((index) => box(starts[index]!).top > lineTop + 1)
  const lineCells = starts.slice(lineStart, lineEnd)
  const textCells = lineCells.filter((offset) => text[offset] !== '\n')
  const candidates = textCells.length === 0 ? lineCells : textCells
  let nearest = candidates[0]!
  let distance = Infinity
  // Bidirectional runs can reverse x along a line, so every cell of the line is compared.
  for (const offset of candidates) {
    const cell = box(offset)
    const gap = point.x < cell.left ? cell.left - point.x : point.x >= cell.right ? point.x - cell.right : 0
    if (gap === 0 && point.x < cell.right) return offset
    if (gap < distance) {
      nearest = offset
      distance = gap
    }
  }
  return nearest
}
