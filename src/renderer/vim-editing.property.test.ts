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
import { moveCharacterCursor } from './vim-editing'
import { calculateTextChange, normalEditCursor } from './vim-text-commands'

describe('Vim character-cursor invariants with attachments', () => {
  it('keeps horizontal movement within text and the optional terminal image character', () => {
    fc.assert(
      fc.property(
        fc.nat(256),
        fc.nat(256),
        fc.boolean(),
        fc.integer({ min: 1, max: 300 }),
        (length, cursor, hasImage, count) => {
          const maximum = hasImage ? length : Math.max(0, length - 1)
          const start = Math.min(cursor, maximum)
          const right = moveCharacterCursor(start, 'right', length, hasImage, count)
          const left = moveCharacterCursor(start, 'left', length, hasImage, count)
          expect(right).toBeGreaterThanOrEqual(0)
          expect(right).toBeLessThanOrEqual(maximum)
          expect(left).toBeGreaterThanOrEqual(0)
          expect(left).toBeLessThanOrEqual(maximum)
          expect(moveCharacterCursor(maximum, 'right', length, hasImage)).toBe(maximum)
          expect(moveCharacterCursor(0, 'left', length, hasImage)).toBe(0)
          if (hasImage && length > 0) {
            expect(moveCharacterCursor(length - 1, 'right', length, true)).toBe(length)
            expect(moveCharacterCursor(length, 'left', length, true)).toBe(length - 1)
          }
        },
      ),
    )
  })

  it('keeps edited cursors on a text character or the terminal image', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'B', 'c'), { minLength: 1, maxLength: 80 }).map((parts) => parts.join('')),
        fc.boolean(),
        (text, hasImage) => {
          const cursor = text.length - 1
          const deleted = calculateTextChange(text, cursor, { kind: 'delete', motion: 'x', count: 1 })
          const toggled = calculateTextChange(text, cursor, { kind: 'case', mode: 'toggle', count: 1 })
          if (deleted === undefined || deleted.kind !== 'edit' || toggled === undefined || toggled.kind !== 'edit')
            throw new Error('The final text character must be editable')
          const deletionCursor = normalEditCursor(deleted.nextCursor, deleted.nextText.length, hasImage)
          const caseCursor = normalEditCursor(toggled.nextCursor, toggled.nextText.length, hasImage)
          expect(deletionCursor).toBe(hasImage ? deleted.nextText.length : Math.max(0, deleted.nextText.length - 1))
          expect(caseCursor).toBe(hasImage ? toggled.nextText.length : toggled.nextText.length - 1)
        },
      ),
    )
  })

  it('replays deletion-only Insert edits at the Escape-relative caret', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 2, maxLength: 80 }).map((parts) => parts.join('')),
        fc.nat(),
        (text, arbitraryCursor) => {
          const cursor = 1 + (arbitraryCursor % (text.length - 1))
          const replayed = calculateTextChange(
            text,
            cursor,
            { kind: 'insert', entry: 'i', insertedText: '', insertOffset: 0, deleteCount: 1 },
            true,
          )
          if (replayed === undefined || replayed.kind !== 'edit') throw new Error('The replay must edit text')
          expect(normalEditCursor(replayed.nextCursor, replayed.nextText.length, false)).toBe(cursor - 1)
        },
      ),
    )
  })
})

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
