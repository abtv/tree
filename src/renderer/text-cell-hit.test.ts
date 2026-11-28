import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { characterBoundaries } from '../domain/text-characters'
import { cellAtPoint, type CellBox } from './text-cell-hit'

const WIDTH = 10
const HEIGHT = 20

/**
 * A synthetic layout: each grapheme is one 10 by 20 cell, lines wrap after `columns` cells, a line
 * break ends its line, and `reversed` lines lay their cells out right to left, like an RTL run.
 */
function layout(text: string, columns: number, reversed: readonly number[] = []): (offset: number) => CellBox {
  const boxes = new Map<number, CellBox>()
  const starts = characterBoundaries(text).slice(0, -1)
  const lines: number[][] = [[]]
  for (const offset of starts) {
    const line = lines.at(-1)!
    line.push(offset)
    if (text[offset] === '\n' || line.length === columns) lines.push([])
  }
  lines.forEach((line, row) => {
    line.forEach((offset, column) => {
      const slot = reversed.includes(row) ? line.length - 1 - column : column
      boxes.set(offset, {
        top: row * HEIGHT,
        bottom: (row + 1) * HEIGHT,
        left: slot * WIDTH,
        right: (slot + 1) * WIDTH,
      })
    })
  })
  return (offset) => boxes.get(offset)!
}

describe('cellAtPoint', () => {
  const text = 'alpha beta gamma delta'
  const box = layout(text, 8)

  it.each([
    { name: 'the left half of a character', x: 32, y: 10, cell: 3 },
    { name: 'the right half of a character', x: 38, y: 10, cell: 3 },
    { name: 'a few pixels across a character midpoint', x: 36, y: 10, cell: 3 },
    { name: 'past the end of a wrapped visual line', x: 400, y: 10, cell: 7 },
    { name: 'the start of the second visual line', x: 1, y: 30, cell: 8 },
    { name: 'past the end of the last line', x: 400, y: 50, cell: 21 },
    { name: 'above the text', x: 12, y: -40, cell: 1 },
    { name: 'below the text', x: 12, y: 400, cell: 17 },
    { name: 'left of the text', x: -30, y: 30, cell: 8 },
  ])('selects the character under $name', ({ x, y, cell }) => {
    expect(cellAtPoint(text, box, { x, y })).toBe(cell)
  })

  it('treats a joined emoji as one cell and never splits it', () => {
    const emoji = 'a👍🏽b'

    expect(cellAtPoint(emoji, layout(emoji, 10), { x: 18, y: 5 })).toBe(1)
    expect(cellAtPoint(emoji, layout(emoji, 10), { x: 25, y: 5 })).toBe(5)
  })

  it('compares every cell of a line whose run is laid out right to left', () => {
    const rtl = 'abcd'
    const reversedBox = layout(rtl, 10, [0])

    expect(cellAtPoint(rtl, reversedBox, { x: 5, y: 5 })).toBe(3)
    expect(cellAtPoint(rtl, reversedBox, { x: 35, y: 5 })).toBe(0)
  })

  it('skips a line break except on a line that holds nothing else', () => {
    const lines = 'ab\n\ncd'
    const lineBox = layout(lines, 10)

    expect(cellAtPoint(lines, lineBox, { x: 400, y: 5 })).toBe(1)
    expect(cellAtPoint(lines, lineBox, { x: 400, y: 25 })).toBe(3)
    expect(cellAtPoint(lines, lineBox, { x: 400, y: 45 })).toBe(5)
  })

  it('places a pointer in empty text at its only position', () => {
    expect(cellAtPoint('', () => ({ top: 0, bottom: 0, left: 0, right: 0 }), { x: 50, y: 50 })).toBe(0)
  })

  it('reads the boxes of one visual line plus a logarithmic search, whatever the text length', () => {
    const long = 'word '.repeat(2_000)
    const measured = layout(long, 80)
    let reads = 0
    const counted = (offset: number): CellBox => {
      reads += 1
      return measured(offset)
    }

    cellAtPoint(long, counted, { x: 405, y: 20 * 60 + 10 })

    expect(reads).toBeLessThan(80 * 2 + 3 * Math.ceil(Math.log2(long.length)) + 10)
  })

  it('selects the character whose cell contains any point inside it', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 60, unit: fc.constantFrom('a', 'b', ' ', 'é', '\n') }),
        fc.integer({ min: 1, max: 12 }),
        fc.nat(),
        fc.double({ min: 0, max: 0.999, noNaN: true }),
        fc.double({ min: 0, max: 0.999, noNaN: true }),
        (sample, columns, pick, fx, fy) => {
          const boxOf = layout(sample, columns)
          const cells = characterBoundaries(sample)
            .slice(0, -1)
            .filter((offset) => sample[offset] !== '\n')
          fc.pre(cells.length > 0)
          const cell = cells[pick % cells.length]!
          const target = boxOf(cell)

          expect(
            cellAtPoint(sample, boxOf, {
              x: target.left + fx * (target.right - target.left),
              y: target.top + fy * (target.bottom - target.top),
            }),
          ).toBe(cell)
        },
      ),
    )
  })
})
