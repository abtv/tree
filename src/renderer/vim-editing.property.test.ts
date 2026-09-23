import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { moveWordBackward, moveWordEnd, moveWordForward } from './vim-editing'

describe('Vim word-motion invariants', () => {
  it('keeps every cursor within the node and moves in the requested direction', () => {
    fc.assert(
      fc.property(fc.string(), fc.nat(), (text, arbitraryCursor) => {
        const cursor = Math.min(arbitraryCursor, Math.max(0, text.length - 1))
        const forward = moveWordForward(text, cursor)
        const backward = moveWordBackward(text, cursor)
        const end = moveWordEnd(text, cursor)
        expect(forward).toBeGreaterThanOrEqual(cursor)
        expect(forward).toBeLessThanOrEqual(text.length)
        expect(backward).toBeGreaterThanOrEqual(0)
        expect(backward).toBeLessThanOrEqual(cursor)
        expect(end).toBeGreaterThanOrEqual(0)
        expect(end).toBeLessThanOrEqual(Math.max(0, text.length - 1))
      }),
    )
  })
})
