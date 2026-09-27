import fc from 'fast-check'
import { expect, it } from 'vitest'
import { editCaretTransition, horizontalCaretTransition } from './vim-caret-transition'

it('keeps counted horizontal caret transitions inside the active node', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1000 }),
      fc.boolean(),
      fc.nat(1000),
      fc.integer({ min: 1, max: 1000 }),
      (textLength, hasAttachment, arbitraryCursor, count) => {
        const maximum = hasAttachment ? textLength : Math.max(0, textLength - 1)
        const cursor = arbitraryCursor % (maximum + 1)
        const imageActive = hasAttachment && cursor === textLength
        const state = { cursor, imageActive }
        for (const direction of ['left', 'right'] as const) {
          const next = horizontalCaretTransition(state, direction, count, textLength, hasAttachment)
          expect(next.cursor).toBeGreaterThanOrEqual(0)
          expect(next.cursor).toBeLessThanOrEqual(maximum)
          expect(next.imageActive).toBe(hasAttachment && next.cursor === textLength)
          if (next.imageTextReturnCursor !== undefined) {
            expect(next.imageTextReturnCursor).toBeGreaterThanOrEqual(0)
            expect(next.imageTextReturnCursor).toBeLessThan(textLength)
          }
        }
      },
    ),
  )
})

it('keeps an edit-result caret within the node and consistent with its image-active flag', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1000 }),
      fc.boolean(),
      fc.nat(1000),
      fc.nat(2000),
      fc.integer({ min: 0, max: 999 }),
      fc.boolean(),
      (textLength, hasAttachment, arbitraryPriorCursor, rawCursor, priorReturnSeed, priorImageActive) => {
        const priorMaximum = hasAttachment ? textLength : Math.max(0, textLength - 1)
        const priorCursor = arbitraryPriorCursor % (priorMaximum + 1)
        const imageActive = hasAttachment && priorImageActive
        const priorState = {
          cursor: imageActive ? textLength : priorCursor,
          imageActive,
          imageTextReturnCursor: imageActive && textLength > 0 ? Math.min(priorReturnSeed, textLength - 1) : undefined,
        }
        const next = editCaretTransition(priorState, rawCursor, textLength, hasAttachment)
        expect(next.cursor).toBeGreaterThanOrEqual(0)
        expect(next.cursor).toBeLessThanOrEqual(hasAttachment ? textLength : Math.max(0, textLength - 1))
        expect(next.imageActive).toBe(hasAttachment && next.cursor === textLength)
        if (next.imageTextReturnCursor !== undefined) {
          expect(next.imageTextReturnCursor).toBeGreaterThanOrEqual(0)
          expect(next.imageTextReturnCursor).toBeLessThan(textLength)
        }
      },
    ),
  )
})
