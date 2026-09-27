import { describe, expect, it } from 'vitest'
import { diffTypedText, resolveReplaceCommit } from './vim-edit-session'

describe('diffTypedText', () => {
  it('reports no change when the final text matches the baseline', () => {
    expect(diffTypedText('abc', 'abc', 1)).toEqual({ insertedText: '', insertOffset: 2, deleteCount: 0 })
  })

  it('finds an insertion in the middle of the baseline', () => {
    expect(diffTypedText('ac', 'abc', 1)).toEqual({ insertedText: 'b', insertOffset: 0, deleteCount: 0 })
  })

  it('finds a deletion with no insertion', () => {
    expect(diffTypedText('abc', 'ac', 1)).toEqual({ insertedText: '', insertOffset: 0, deleteCount: 1 })
  })

  it('treats a full replacement as one insertion spanning the whole baseline', () => {
    expect(diffTypedText('abc', 'xyz', 0)).toEqual({ insertedText: 'xyz', insertOffset: 0, deleteCount: 3 })
  })

  it('handles an empty baseline as a pure insertion', () => {
    expect(diffTypedText('', 'new', 0)).toEqual({ insertedText: 'new', insertOffset: 0, deleteCount: 0 })
  })

  it('handles typing that ends empty as a pure deletion', () => {
    expect(diffTypedText('abc', '', 0)).toEqual({ insertedText: '', insertOffset: 0, deleteCount: 3 })
  })
})

describe('resolveReplaceCommit', () => {
  it('returns undefined when nothing was typed', () => {
    expect(resolveReplaceCommit({ baseline: 'abc', position: 1, typed: '' })).toBeUndefined()
  })

  it('overwrites in place when typed text fits within the remaining baseline', () => {
    expect(resolveReplaceCommit({ baseline: 'abcd', position: 1, typed: 'X' })).toEqual({
      finalText: 'aXcd',
      replacedStart: 1,
      replacedEnd: 2,
      rawCursor: 2,
    })
  })

  it('appends past the end of the baseline once typed text exceeds it', () => {
    expect(resolveReplaceCommit({ baseline: 'ab', position: 1, typed: 'XYZ' })).toEqual({
      finalText: 'aXYZ',
      replacedStart: 1,
      replacedEnd: 2,
      rawCursor: 4,
    })
  })

  it('shrinks the replaced range after a Backspace during Replace', () => {
    const grown = resolveReplaceCommit({ baseline: 'ab', position: 1, typed: 'XY' })
    expect(grown).toEqual({ finalText: 'aXY', replacedStart: 1, replacedEnd: 2, rawCursor: 3 })
    expect(resolveReplaceCommit({ baseline: 'ab', position: 1, typed: 'X' })).toEqual({
      finalText: 'aX',
      replacedStart: 1,
      replacedEnd: 2,
      rawCursor: 2,
    })
  })
})
