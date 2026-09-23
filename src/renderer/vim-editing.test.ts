import { describe, expect, it } from 'vitest'
import {
  currentWordEnd,
  findCharacter,
  firstNonWhitespace,
  moveWordBackward,
  moveWordEnd,
  moveWordForward,
  vimPastePosition,
} from './vim-editing'

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

  it('treats punctuation runs as words and handles accented letters', () => {
    expect(moveWordForward('foo.bar baz', 0)).toBe(3)
    expect(moveWordForward('foo.bar baz', 3)).toBe(4)
    expect(moveWordBackward('foo.bar baz', 4)).toBe(3)
    expect(moveWordForward('café! next', 0)).toBe(4)
    expect(moveWordEnd('foo.bar', 0)).toBe(2)
    expect(moveWordEnd('foo.bar', 2)).toBe(3)
    expect(moveWordEnd('foo.bar', 3)).toBe(6)
    expect(currentWordEnd('foo.bar', 3)).toBe(3)
  })

  it('finds counted characters in both directions without wrapping', () => {
    expect(findCharacter('a.b.c', 0, '.', 'forward', 2)).toBe(3)
    expect(findCharacter('a.b.c', 4, '.', 'backward', 2)).toBe(1)
    expect(findCharacter('a.b.c', 3, '.', 'forward')).toBeUndefined()
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
