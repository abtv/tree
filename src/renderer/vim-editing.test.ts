import { describe, expect, it } from 'vitest'
import {
  currentWordEnd,
  findCharacter,
  firstNonWhitespace,
  moveWORDBackward,
  moveWORDEnd,
  moveWORDForward,
  moveWordBackward,
  moveWordEnd,
  moveWordEndBackward,
  moveWordForward,
  isImageCaretCursor,
  moveCharacterCursor,
  textObjectRange,
  vimPastePosition,
} from './vim-editing'

// @requirement PRODUCT.md §20.2
describe('Vim image character positions (PRODUCT §4.3 and §20.2)', () => {
  it.each([
    {
      name: 'plain text ends on its final character',
      cursor: 2,
      direction: 'right' as const,
      length: 3,
      image: false,
      count: 1,
      expected: 2,
    },
    {
      name: 'the image follows the final text character',
      cursor: 2,
      direction: 'right' as const,
      length: 3,
      image: true,
      count: 1,
      expected: 3,
    },
    {
      name: 'a count reaches the image from a middle character',
      cursor: 1,
      direction: 'right' as const,
      length: 3,
      image: true,
      count: 2,
      expected: 3,
    },
    {
      name: 'repeating right on the image stays there',
      cursor: 3,
      direction: 'right' as const,
      length: 3,
      image: true,
      count: 2,
      expected: 3,
    },
    {
      name: 'left leaves the image for the final text character',
      cursor: 3,
      direction: 'left' as const,
      length: 3,
      image: true,
      count: 1,
      expected: 2,
    },
    {
      name: 'counted left clamps at the first text character',
      cursor: 3,
      direction: 'left' as const,
      length: 3,
      image: true,
      count: 9,
      expected: 0,
    },
    {
      name: 'an image-only node has one character',
      cursor: 0,
      direction: 'right' as const,
      length: 0,
      image: true,
      count: 3,
      expected: 0,
    },
    {
      name: 'left stays on an image-only character',
      cursor: 0,
      direction: 'left' as const,
      length: 0,
      image: true,
      count: 3,
      expected: 0,
    },
    {
      name: 'empty text has one insertion position',
      cursor: 0,
      direction: 'right' as const,
      length: 0,
      image: false,
      count: 3,
      expected: 0,
    },
  ])('$name', ({ cursor, direction, length, image, count, expected }) => {
    expect(moveCharacterCursor(cursor, direction, length, image, count)).toBe(expected)
  })
})

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

  it('moves by whitespace-delimited WORDs and backward word ends', () => {
    expect(moveWORDForward('foo.bar  baz', 0)).toBe(9)
    expect(moveWORDBackward('foo.bar  baz', 12)).toBe(9)
    expect(moveWORDEnd('foo.bar  baz', 0)).toBe(6)
    expect(moveWordEndBackward('one two.three', 13)).toBe(7)
    expect(moveWordEndBackward('one two', 4)).toBe(2)
  })
})

describe('Vim text objects', () => {
  it('selects words, WORDs, adjacent space, and counts without leaving the node', () => {
    expect(textObjectRange('one.two  three', 1, 'i', 'w')).toEqual({ start: 0, end: 3 })
    expect(textObjectRange('one.two  three', 1, 'a', 'w')).toEqual({ start: 0, end: 3 })
    expect(textObjectRange('one.two  three', 1, 'i', 'W')).toEqual({ start: 0, end: 7 })
    expect(textObjectRange('one two three', 1, 'i', 'w', 2)).toEqual({ start: 0, end: 7 })
    expect(textObjectRange('one  two', 6, 'a', 'w')).toEqual({ start: 3, end: 8 })
    expect(textObjectRange('café next', 2, 'i', 'w')).toEqual({ start: 0, end: 4 })
    expect(textObjectRange('', 0, 'i', 'w')).toBeUndefined()
  })

  it('selects quoted text and nested brackets, and ignores unmatched pairs', () => {
    expect(textObjectRange('say "a \\"b\\" c" now', 9, 'i', '"')).toEqual({ start: 5, end: 14 })
    expect(textObjectRange('say "abc" now', 5, 'a', '"')).toEqual({ start: 4, end: 9 })
    expect(textObjectRange('a(b[c]d)e', 4, 'i', '[')).toEqual({ start: 4, end: 5 })
    expect(textObjectRange('a(b[c]d)e', 4, 'a', '[', 1)).toEqual({ start: 3, end: 6 })
    expect(textObjectRange('a(b[c]d)e', 4, 'a', '[', 2)).toBeUndefined()
    expect(textObjectRange('a(b[c]d)e', 4, 'a', '(', 1)).toEqual({ start: 1, end: 8 })
    expect(textObjectRange('a(b[c]d', 4, 'i', '(')).toBeUndefined()
  })

  it('accepts either bracket delimiter and all supported quote delimiters', () => {
    expect(textObjectRange('a{b}', 2, 'i', '}')).toEqual({ start: 2, end: 3 })
    expect(textObjectRange('a<b>', 2, 'a', '>')).toEqual({ start: 1, end: 4 })
    expect(textObjectRange("a'b'", 2, 'i', "'")).toEqual({ start: 2, end: 3 })
    expect(textObjectRange('a`b`', 2, 'a', '`')).toEqual({ start: 1, end: 4 })
    expect(textObjectRange('a"b', 2, 'i', '"')).toBeUndefined()
    expect(textObjectRange('one two', 3, 'i', 'w')).toEqual({ start: 3, end: 4 })
    expect(textObjectRange('one two', 0, 'a', 'w')).toEqual({ start: 0, end: 4 })
  })

  it('uses outer pairs for counts and leaves incomplete or out-of-range objects untouched', () => {
    expect(textObjectRange('a(b(c)d)e', 4, 'i', '(', 1)).toEqual({ start: 4, end: 5 })
    expect(textObjectRange('a(b(c)d)e', 4, 'i', '(', 2)).toEqual({ start: 2, end: 7 })
    expect(textObjectRange('a(b(c)d)e', 4, 'a', ')', 2)).toEqual({ start: 1, end: 8 })
    expect(textObjectRange(')orphan(', 0, 'i', ')')).toBeUndefined()
    expect(textObjectRange('abc', 0, 'i', '?')).toBeUndefined()
    expect(textObjectRange('abc', 0, 'i', 'w', 0)).toBeUndefined()
    expect(textObjectRange('abc', 2, 'i', 'w', 3)).toEqual({ start: 0, end: 3 })
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

describe('Vim image caret cursor rule', () => {
  it('is active only once the cursor reaches the terminal image position of an attached node', () => {
    expect(isImageCaretCursor(true, 2, 1)).toBe(false)
    expect(isImageCaretCursor(true, 2, 2)).toBe(true)
  })

  it('is never active without an attachment, regardless of cursor', () => {
    expect(isImageCaretCursor(false, 2, 2)).toBe(false)
  })
})
