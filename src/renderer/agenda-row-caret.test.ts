import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { propertyRuns } from '../test/property-runs'
import {
  arrivalCaret,
  caretMarks,
  clampCaret,
  copyRange,
  markedPieces,
  maxOffset,
  selectionRange,
  type RowCaretMode,
} from './agenda-row-caret'

const modes: RowCaretMode[] = ['normal', 'insert', 'visual', 'hidden']

// @requirement PRODUCT.md §4.3
it('marks and copies complete emoji in read-only rows and clamps restored offsets to their starts', () => {
  const text = 'A👩‍💻Z'
  const caret = { key: 'k', anchor: 1, focus: 3 }
  expect(clampCaret(caret, text, 'normal')).toEqual({ key: 'k', anchor: 1, focus: 1 })
  expect(caretMarks(caret, text, 'normal')).toEqual([{ start: 1, end: 6, className: 'agenda-caret' }])
  expect(copyRange(caret, text, 'normal')).toEqual({ start: 1, end: 6 })
  expect(selectionRange({ key: 'k', anchor: 0, focus: 1 }, text, 'visual')).toEqual({ start: 0, end: 6 })
})

describe('Agenda row caret', () => {
  // @requirement PRODUCT.md §23.4
  it('arrives at offset zero and clamps to the last character in Normal and Visual, the end elsewhere', () => {
    expect(arrivalCaret('k')).toEqual({ key: 'k', anchor: 0, focus: 0 })
    expect(maxOffset('x'.repeat(5), 'normal')).toBe(4)
    expect(maxOffset('x'.repeat(5), 'visual')).toBe(4)
    expect(maxOffset('x'.repeat(5), 'insert')).toBe(5)
    expect(maxOffset('x'.repeat(0), 'normal')).toBe(0)
    expect(clampCaret({ key: 'k', anchor: 9, focus: 9 }, 'x'.repeat(5), 'normal')).toEqual({
      key: 'k',
      anchor: 4,
      focus: 4,
    })
    expect(clampCaret({ key: 'k', anchor: 9, focus: 9 }, 'x'.repeat(5), 'insert')).toEqual({
      key: 'k',
      anchor: 5,
      focus: 5,
    })
    const caret = { key: 'k', anchor: 2, focus: 2 }
    expect(clampCaret(caret, 'x'.repeat(5), 'normal')).toBe(caret)
    // Normal has no range, so a stale selection collapses to the caret.
    expect(clampCaret({ key: 'k', anchor: 1, focus: 3 }, 'x'.repeat(5), 'normal')).toEqual({
      key: 'k',
      anchor: 3,
      focus: 3,
    })
  })

  // @requirement PRODUCT.md §23.4
  it('includes both end characters of a Visual selection and copies the block character in Normal', () => {
    expect(selectionRange({ key: 'k', anchor: 4, focus: 1 }, 'x'.repeat(6), 'visual')).toEqual({ start: 1, end: 5 })
    expect(selectionRange({ key: 'k', anchor: 5, focus: 5 }, 'x'.repeat(6), 'visual')).toEqual({ start: 5, end: 6 })
    expect(selectionRange({ key: 'k', anchor: 4, focus: 1 }, 'x'.repeat(6), 'insert')).toEqual({ start: 1, end: 4 })
    expect(copyRange({ key: 'k', anchor: 2, focus: 2 }, 'x'.repeat(6), 'normal')).toEqual({ start: 2, end: 3 })
    expect(copyRange({ key: 'k', anchor: 2, focus: 2 }, 'x'.repeat(6), 'insert')).toEqual({ start: 2, end: 2 })
    expect(copyRange({ key: 'k', anchor: 0, focus: 0 }, 'x'.repeat(0), 'normal')).toEqual({ start: 0, end: 0 })
  })

  // @requirement PRODUCT.md §23.4
  it('draws a block, a thin caret, a selection, or nothing by mode, and an end caret for empty text', () => {
    const caret = { key: 'k', anchor: 2, focus: 2 }
    expect(caretMarks(caret, 'x'.repeat(6), 'normal')).toEqual([{ start: 2, end: 3, className: 'agenda-caret' }])
    expect(caretMarks(caret, 'x'.repeat(6), 'insert')).toEqual([{ start: 2, end: 2, className: 'agenda-caret' }])
    expect(caretMarks({ key: 'k', anchor: 6, focus: 6 }, 'x'.repeat(6), 'insert')).toEqual([
      { start: 6, end: 6, className: 'agenda-caret' },
    ])
    expect(caretMarks({ key: 'k', anchor: 1, focus: 3 }, 'x'.repeat(6), 'visual')).toEqual([
      { start: 1, end: 4, className: 'agenda-selection' },
    ])
    expect(caretMarks({ key: 'k', anchor: 1, focus: 3 }, 'x'.repeat(6), 'insert')).toEqual([
      { start: 1, end: 3, className: 'agenda-selection' },
    ])
    expect(caretMarks(arrivalCaret('k'), 'x'.repeat(0), 'normal')).toEqual([
      { start: 0, end: 0, className: 'agenda-caret' },
    ])
    expect(caretMarks(caret, 'x'.repeat(6), 'hidden')).toEqual([])
  })

  // @requirement PRODUCT.md §23.4
  it('keeps every offset in range and every piece list equal to the text, with one caret at most', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 12 }),
        fc.nat(20),
        fc.nat(20),
        fc.constantFrom(...modes),
        fc.nat(12),
        fc.nat(12),
        (text, anchor, focus, mode, cutA, cutB) => {
          const caret = clampCaret({ key: 'k', anchor, focus }, text, mode)
          expect(caret.anchor).toBeLessThanOrEqual(maxOffset(text, mode))
          expect(caret.focus).toBeLessThanOrEqual(maxOffset(text, mode))
          const marks = caretMarks(caret, text, mode)
          const start = Math.min(cutA, cutB, text.length)
          const end = Math.min(Math.max(cutA, cutB), text.length)
          const pieces = markedPieces(text, start, end, marks, end === text.length)
          expect(pieces.map((piece) => piece.text).join('')).toBe(text.slice(start, end))
          expect(marks.filter((mark) => mark.className === 'agenda-caret').length).toBeLessThanOrEqual(1)
          const whole = markedPieces(text, 0, text.length, marks, true)
          expect(whole.map((piece) => piece.text).join('')).toBe(text)
          if (mode === 'hidden') expect(whole.every((piece) => piece.className === undefined)).toBe(true)
          else
            expect(whole.filter((piece) => piece.className === 'agenda-caret').length).toBe(
              marks.filter((mark) => mark.className === 'agenda-caret').length,
            )
        },
      ),
      { numRuns: propertyRuns(500) },
    )
  })

  // @requirement PRODUCT.md §23.4
  it('places an empty mark in exactly one region of a split text', () => {
    const marks = caretMarks({ key: 'k', anchor: 4, focus: 4 }, 'x'.repeat(8), 'insert')
    const first = markedPieces('abcdefgh', 0, 4, marks, false)
    const second = markedPieces('abcdefgh', 4, 8, marks, true)
    expect(first.some((piece) => piece.className !== undefined)).toBe(false)
    expect(second[0]).toEqual({ text: '', className: 'agenda-caret' })
    expect(second.map((piece) => piece.text).join('')).toBe('efgh')
  })
})
