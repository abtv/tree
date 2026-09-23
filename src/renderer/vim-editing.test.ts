import { describe, expect, it } from 'vitest'
import { firstNonWhitespace, moveWordBackward, moveWordForward, vimPastePosition } from './vim-editing'

describe('Vim text motions', () => {
  it('moves between word starts', () => {
    expect(moveWordForward('one  two', 0)).toBe(5)
    expect(moveWordForward('one  two', 5)).toBe(8)
    expect(moveWordBackward('one  two', 8)).toBe(5)
    expect(moveWordBackward('one  two', 5)).toBe(0)
  })

  it('finds the first non-whitespace character', () => {
    expect(firstNonWhitespace('   text')).toBe(3)
    expect(firstNonWhitespace('   ')).toBe(0)
  })
})

describe('Vim paste positions', () => {
  it('puts after the current character for p', () => {
    expect(vimPastePosition(3, 1, true)).toBe(2)
    expect(vimPastePosition(3, 2, true)).toBe(3)
  })

  it('puts before the current character for P', () => {
    expect(vimPastePosition(3, 1, false)).toBe(1)
  })

  it('clamps positions for empty and boundary nodes', () => {
    expect(vimPastePosition(0, 0, true)).toBe(0)
    expect(vimPastePosition(3, 99, false)).toBe(3)
    expect(vimPastePosition(3, -1, false)).toBe(0)
  })
})
