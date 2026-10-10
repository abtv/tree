import { describe, expect, it } from 'vitest'
import {
  currentWordEnd,
  findCharacter,
  firstNonWhitespace,
  imageTextReturnCursor,
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

// @requirement PRODUCT.md §20.2.9
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

describe('Vim image text return cursor', () => {
  it('has no return position for an image-only node', () => {
    expect(imageTextReturnCursor(0, 3, 0)).toBeUndefined()
  })

  it('records the final text character reached by a counted motion', () => {
    expect(imageTextReturnCursor(0, 1, 5)).toBe(0)
    expect(imageTextReturnCursor(2, 3, 10)).toBe(4)
    expect(imageTextReturnCursor(8, 5, 10)).toBe(9)
  })
})

describe('Vim word motions at boundaries', () => {
  it('moves across whitespace runs and stops at the next word start', () => {
    expect(moveWordForward('one  two', 0)).toBe(5)
    expect(moveWordForward('one  two', 3)).toBe(5)
    expect(moveWordForward('one  two', 5)).toBe(8)
    expect(moveWordForward('a b', 0)).toBe(2)
    expect(moveWordForward('one', 2)).toBe(3)
    expect(moveWordForward('', 0)).toBe(0)
    expect(moveWordBackward('one  two', 8)).toBe(5)
    expect(moveWordBackward('one  two', 3)).toBe(0)
    expect(moveWordBackward('', 0)).toBe(0)
  })

  it('moves to word ends, including across whitespace and the empty node', () => {
    expect(moveWordEnd('one two', 0)).toBe(2)
    expect(moveWordEnd('one two', 3)).toBe(6)
    expect(moveWordEnd('one ', 0)).toBe(2)
    expect(moveWordEnd('one  ', 2)).toBe(4)
    expect(moveWordEnd('', 0)).toBe(0)
  })

  it('moves by whitespace-delimited WORDs at boundaries', () => {
    expect(moveWORDForward('foo  bar', 3)).toBe(5)
    expect(moveWORDForward('foo', 3)).toBe(3)
    expect(moveWORDBackward('foo  bar', 5)).toBe(0)
    expect(moveWORDBackward('', 0)).toBe(0)
    expect(moveWORDEnd('foo.bar  baz', 9)).toBe(11)
    expect(moveWORDEnd('', 0)).toBe(0)
    expect(moveWordEndBackward('one two', 0)).toBe(0)
    expect(moveWordEndBackward('', 0)).toBe(0)
    expect(moveWordEndBackward('one two', 4)).toBe(2)
  })

  it('finds the current word end and handles the empty node', () => {
    expect(currentWordEnd('foo.bar', 3)).toBe(3)
    expect(currentWordEnd('', 0)).toBe(0)
  })

  it('finds a counted character and returns the cursor for a zero count', () => {
    expect(findCharacter('abc', 1, 'x', 'forward', 0)).toBe(1)
  })
})

describe('Vim text-object boundaries', () => {
  it('selects around a WORD run and extends over following whitespace', () => {
    expect(textObjectRange('one.two  three', 1, 'a', 'W')).toEqual({ start: 0, end: 9 })
  })

  it('selects words, whitespace runs and counts without leaving the node', () => {
    expect(textObjectRange('one  two', 1, 'i', 'w')).toEqual({ start: 0, end: 3 })
    expect(textObjectRange('one  two', 3, 'a', 'w')).toEqual({ start: 3, end: 5 })
    expect(textObjectRange('  ', 1, 'i', 'w')).toEqual({ start: 0, end: 2 })
    expect(textObjectRange('one', 0, 'a', 'w')).toEqual({ start: 0, end: 3 })
    expect(textObjectRange('one two', 0, 'i', 'w', 5)).toEqual({ start: 0, end: 7 })
  })

  it('honors backslash parity before a quote delimiter', () => {
    expect(textObjectRange('a\\"b"c', 3, 'i', '"')).toBeUndefined()
    expect(textObjectRange('a\\\\"b"c', 4, 'i', '"')).toEqual({ start: 4, end: 5 })
    expect(textObjectRange('\\"x"', 2, 'i', '"')).toBeUndefined()
  })

  it('treats the opening and closing bracket positions as inside the pair', () => {
    expect(textObjectRange('a(b)c', 1, 'i', '(')).toEqual({ start: 2, end: 3 })
    expect(textObjectRange('a(b)c', 3, 'i', '(')).toEqual({ start: 2, end: 3 })
    expect(textObjectRange('a(b)c', 1, 'a', '(')).toEqual({ start: 1, end: 4 })
  })

  it('selects both bracket delimiters from either side', () => {
    expect(textObjectRange('a<b>', 2, 'i', '<')).toEqual({ start: 2, end: 3 })
    expect(textObjectRange('a<b>', 2, 'a', '<')).toEqual({ start: 1, end: 4 })
    expect(textObjectRange('a<b>', 2, 'i', '>')).toEqual({ start: 2, end: 3 })
  })

  it('selects a quote pair when the cursor sits on either delimiter', () => {
    expect(textObjectRange('"x"', 0, 'i', '"')).toEqual({ start: 1, end: 2 })
    expect(textObjectRange('"x"', 2, 'i', '"')).toEqual({ start: 1, end: 2 })
  })

  it('does not select a quote pair from outside it', () => {
    expect(textObjectRange('x"a"', 0, 'i', '"')).toBeUndefined()
    expect(textObjectRange('"x" a', 4, 'i', '"')).toBeUndefined()
    expect(textObjectRange('a "x"', 0, 'i', '"')).toBeUndefined()
  })

  it('ignores a quote object when the count is not one', () => {
    expect(textObjectRange('"a" "b"', 5, 'i', '"', 2)).toBeUndefined()
  })

  it('extends a count across a following punctuation run and spaces', () => {
    expect(textObjectRange('one.two', 1, 'i', 'w', 2)).toEqual({ start: 0, end: 4 })
    expect(textObjectRange('one.', 1, 'i', 'w', 2)).toEqual({ start: 0, end: 4 })
    expect(textObjectRange('one two.three', 1, 'i', 'w', 2)).toEqual({ start: 0, end: 7 })
  })
})

describe('Vim word motions at clamped boundaries', () => {
  it('clamps a cursor beyond the text for the end motions', () => {
    expect(moveWordEnd('one two', 99)).toBe(6)
    expect(moveWORDEnd('one two', 99)).toBe(6)
    expect(currentWordEnd('ab', 99)).toBe(1)
    expect(moveWordEndBackward('ab', 5)).toBe(0)
  })

  it('does not move a backward word motion below the start', () => {
    expect(moveWordBackward('  a', 2)).toBe(0)
    expect(moveWordBackward('  ', 2)).toBe(0)
    expect(moveWORDBackward('  ', 2)).toBe(0)
    expect(moveWordBackward('ab', 5)).toBe(2)
  })

  it('advances to the end of the next WORD run and stops at a non-space', () => {
    expect(moveWORDForward('foo  bar', 3)).toBe(5)
    expect(moveWORDEnd('   ab', 0)).toBe(4)
    expect(moveWORDEnd('  a b', 0)).toBe(2)
    expect(moveWORDEnd('a b', 0)).toBe(2)
    expect(moveWordEnd('one  two three', 3)).toBe(7)
  })

  it('finds the current word end at punctuation, counts and the terminal character', () => {
    expect(currentWordEnd('foo.bar', 0)).toBe(2)
    expect(currentWordEnd('.', 0)).toBe(0)
  })
})
