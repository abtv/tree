import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { characterBoundaries } from '../domain/text-characters'
import { visualLineCursor } from './editor-dom'

describe('visual line motion invariants', () => {
  it('lands on a whole character of the adjacent line, clamped to its available columns', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', ' ', 'Ж', '👩‍💻', 'é'), { minLength: 1, maxLength: 80 }),
        fc.integer({ min: 1, max: 12 }),
        fc.nat(100),
        fc.nat(20),
        fc.boolean(),
        fc.boolean(),
        (characters, columns, rawIndex, desiredColumn, down, reversed) => {
          const text = characters.join('')
          const boundaries = characterBoundaries(text).slice(0, -1)
          const index = rawIndex % boundaries.length
          const position = (offset: number) => {
            const character = boundaries.findLastIndex((boundary) => boundary <= offset)
            const column = character % columns
            return { top: Math.floor(character / columns) * 20, left: (reversed ? columns - 1 - column : column) * 10 }
          }
          const targetLine = Math.floor(index / columns) + (down ? 1 : -1)
          const result = visualLineCursor(text, position, boundaries[index]!, down ? 'down' : 'up', desiredColumn * 10)
          if (targetLine < 0 || targetLine * columns >= boundaries.length) expect(result).toBeUndefined()
          else {
            const logicalColumn = reversed ? Math.max(0, columns - 1 - desiredColumn) : desiredColumn
            const expectedIndex = Math.min(
              targetLine * columns + Math.min(logicalColumn, columns - 1),
              boundaries.length - 1,
            )
            expect(result).toBe(boundaries[expectedIndex])
          }
        },
      ),
    )
  })
})
