import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  moveWORDBackward,
  moveWORDEnd,
  moveWORDForward,
  moveWordBackward,
  moveWordEnd,
  moveWordEndBackward,
  moveWordForward,
  textObjectRange,
} from './vim-editing'

describe('Vim word-motion invariants', () => {
  it('keeps every cursor within the node and moves in the requested direction', () => {
    fc.assert(
      fc.property(fc.string(), fc.nat(), (text, arbitraryCursor) => {
        const cursor = Math.min(arbitraryCursor, Math.max(0, text.length - 1))
        const forward = moveWordForward(text, cursor)
        const backward = moveWordBackward(text, cursor)
        const end = moveWordEnd(text, cursor)
        const wordForward = moveWORDForward(text, cursor)
        const wordBackward = moveWORDBackward(text, cursor)
        const wordEnd = moveWORDEnd(text, cursor)
        const previousEnd = moveWordEndBackward(text, cursor)
        expect(forward).toBeGreaterThanOrEqual(cursor)
        expect(forward).toBeLessThanOrEqual(text.length)
        expect(backward).toBeGreaterThanOrEqual(0)
        expect(backward).toBeLessThanOrEqual(cursor)
        expect(end).toBeGreaterThanOrEqual(0)
        expect(end).toBeLessThanOrEqual(Math.max(0, text.length - 1))
        expect(wordForward).toBeGreaterThanOrEqual(cursor)
        expect(wordForward).toBeLessThanOrEqual(text.length)
        expect(wordBackward).toBeGreaterThanOrEqual(0)
        expect(wordBackward).toBeLessThanOrEqual(cursor)
        expect(wordEnd).toBeGreaterThanOrEqual(0)
        expect(wordEnd).toBeLessThanOrEqual(Math.max(0, text.length - 1))
        expect(previousEnd).toBeGreaterThanOrEqual(0)
        expect(previousEnd).toBeLessThanOrEqual(cursor)
      }),
    )
  })
})

describe('Vim text-object invariants', () => {
  it('keeps each selected range inside its node and inner ranges inside around ranges', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.nat(),
        fc.constantFrom('w', 'W', '"', "'", '`', '(', '[', '{', '<'),
        fc.integer({ min: 1, max: 3 }),
        (text, cursor, object, count) => {
          const inner = textObjectRange(text, cursor, 'i', object, count)
          const around = textObjectRange(text, cursor, 'a', object, count)
          for (const range of [inner, around]) {
            if (range === undefined) continue
            expect(range.start).toBeGreaterThanOrEqual(0)
            expect(range.end).toBeGreaterThanOrEqual(range.start)
            expect(range.end).toBeLessThanOrEqual(text.length)
          }
          if (inner !== undefined && around !== undefined) {
            expect(inner.start).toBeGreaterThanOrEqual(around.start)
            expect(inner.end).toBeLessThanOrEqual(around.end)
          }
        },
      ),
    )
  })
})
