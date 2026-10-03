import { describe, expect, it } from 'vitest'
import {
  calculateSurround,
  calculateTextChange,
  caseEdits,
  insertPosition,
  isTextMotion,
  isTextObjectKey,
  normalEditCursor,
  parseCount,
  repeatedFindMotion,
  textDifference,
  textMotion,
  transformCase,
} from './vim-text-commands'

describe('Vim text command calculations', () => {
  it('bounds counts and returns inclusive word-end ranges', () => {
    expect(parseCount('')).toBe(1)
    expect(parseCount('0')).toBe(1)
    expect(textMotion('one two', 0, 'e', 1)).toEqual({ target: 2, start: 0, end: 3 })
    expect(textMotion('one two', 0, 'fZ', 1)).toBeUndefined()
  })

  it('inverts the last character-find motion', () => {
    expect(repeatedFindMotion({ kind: 't', character: 'x' }, true)).toBe('Tx')
    expect(repeatedFindMotion(undefined, false)).toBeUndefined()
  })

  it('calculates an edit and preserves the removed text for the register', () => {
    expect(calculateTextChange('one two', 0, { kind: 'delete', motion: 'w', count: 1 })).toEqual({
      kind: 'edit',
      start: 0,
      end: 4,
      inserted: '',
      nextText: 'two',
      nextCursor: 0,
      registerText: 'one ',
    })
  })

  it('replays an insertion using its recorded offset and deletion count', () => {
    expect(
      calculateTextChange(
        'abc',
        1,
        { kind: 'insert', entry: 'i', insertedText: 'XY', insertOffset: 1, deleteCount: 1 },
        true,
      ),
    ).toEqual({ kind: 'edit', start: 2, end: 3, inserted: 'XY', nextText: 'abXY', nextCursor: 3 })
  })

  it('replays a deletion-only Insert edit at the caret left by Escape', () => {
    expect(
      calculateTextChange(
        'acd',
        1,
        { kind: 'insert', entry: 'i', insertedText: '', insertOffset: 0, deleteCount: 1 },
        true,
      ),
    ).toMatchObject({ nextText: 'ad', nextCursor: 0 })
    expect(
      calculateTextChange(
        'abc',
        0,
        { kind: 'insert', entry: 'i', insertedText: '', insertOffset: 0, deleteCount: 1 },
        true,
      ),
    ).toMatchObject({ nextText: 'bc', nextCursor: 0 })
  })

  it('advances a case toggle past the final text character for an attached image', () => {
    expect(calculateTextChange('ab', 1, { kind: 'case', mode: 'toggle', count: 1 })).toMatchObject({
      nextText: 'aB',
      nextCursor: 2,
    })
    expect(calculateTextChange('ab', 0, { kind: 'case', mode: 'toggle', count: 2 })).toMatchObject({
      nextText: 'AB',
      nextCursor: 2,
    })
    expect(normalEditCursor(2, 2, true)).toBe(2)
    expect(normalEditCursor(2, 2, false)).toBe(1)
  })

  it('keeps Unicode case expansion in the calculated edit', () => {
    expect(transformCase('İ', 'lower')).toBe('i̇')
    expect(calculateTextChange('İA', 0, { kind: 'case', mode: 'lower', count: 1 })).toMatchObject({
      start: 0,
      end: 1,
      inserted: 'i̇',
      nextText: 'i̇A',
      nextCursor: 2,
    })
  })
})

describe('Vim key classification', () => {
  it('accepts single-character text motions and rejects multi-character lookalikes', () => {
    expect(isTextMotion('w')).toBe(true)
    expect(isTextMotion('h')).toBe(true)
    expect(isTextMotion('q')).toBe(false)
    expect(isTextMotion('hl')).toBe(false)
  })

  it('accepts single-character text-object keys and rejects unsupported ones', () => {
    expect(isTextObjectKey('w')).toBe(true)
    expect(isTextObjectKey('"')).toBe(true)
    expect(isTextObjectKey('(')).toBe(true)
    expect(isTextObjectKey('z')).toBe(false)
    expect(isTextObjectKey('ww')).toBe(false)
    expect(isTextObjectKey('wW')).toBe(false)
    expect(isTextObjectKey('')).toBe(false)
  })
})

describe('Vim insert entries', () => {
  it('resolves each insert entry to its starting position', () => {
    expect(insertPosition('  abc', 1, 'i')).toBe(1)
    expect(insertPosition('  abc', 1, 'a')).toBe(2)
    expect(insertPosition('  abc', 4, 'a')).toBe(5)
    expect(insertPosition('  abc', 1, 'I')).toBe(2)
    expect(insertPosition('  abc', 1, 'A')).toBe(5)
  })
})

describe('Vim motion ranges', () => {
  it('covers character-delete and whole-line motions', () => {
    expect(textMotion('abcdef', 1, 'x', 2)).toEqual({ target: 1, start: 1, end: 3 })
    expect(textMotion('abcdef', 5, 'x', 9)).toEqual({ target: 5, start: 5, end: 6 })
    expect(textMotion('abcdef', 3, 'X', 2)).toEqual({ target: 1, start: 1, end: 3 })
    expect(textMotion('abcdef', 1, 'X', 9)).toEqual({ target: 0, start: 0, end: 1 })
    expect(textMotion('abcdef', 2, 'all', 1)).toEqual({ target: 0, start: 0, end: 6 })
  })

  it('covers line-boundary motions 0, ^ and $', () => {
    expect(textMotion('  abc', 2, '0', 1)).toEqual({ target: 0, start: 0, end: 2 })
    expect(textMotion('  abc', 3, '^', 1)).toEqual({ target: 2, start: 2, end: 3 })
    expect(textMotion('abc  ', 1, '$', 1)).toEqual({ target: 4, start: 1, end: 5 })
  })

  it('covers horizontal motions with counts and clamping', () => {
    expect(textMotion('abc', 1, 'l', 1)).toEqual({ target: 2, start: 1, end: 2 })
    expect(textMotion('abc', 1, 'h', 1)).toEqual({ target: 0, start: 0, end: 1 })
    expect(textMotion('abc', 1, 'l', 9)).toEqual({ target: 3, start: 1, end: 3 })
    expect(textMotion('abc', 2, 'h', 9)).toEqual({ target: 0, start: 0, end: 2 })
  })

  it('covers word motions, counts and the change-word variant', () => {
    expect(textMotion('one two three', 0, 'w', 2)).toEqual({ target: 8, start: 0, end: 8 })
    expect(textMotion('one two three', 8, 'b', 1)).toEqual({ target: 4, start: 4, end: 8 })
    expect(textMotion('one two', 0, 'e', 1)).toEqual({ target: 2, start: 0, end: 3 })
    expect(textMotion('one.two baz', 0, 'W', 1)).toEqual({ target: 8, start: 0, end: 8 })
    expect(textMotion('one two', 4, 'B', 1)).toEqual({ target: 0, start: 0, end: 4 })
    expect(textMotion('one.two baz', 0, 'E', 1)).toEqual({ target: 6, start: 0, end: 7 })
    expect(textMotion('one two', 2, 'ge', 1)).toEqual({ target: 0, start: 0, end: 2 })
    expect(textMotion('one two', 0, 'w', 1, true)).toEqual({ target: 2, start: 0, end: 3 })
    expect(textMotion('one two three', 0, 'w', 2, true)).toEqual({ target: 6, start: 0, end: 7 })
    expect(textMotion('one two', 3, 'w', 1, true)).toEqual({ target: 4, start: 3, end: 4 })
    expect(textMotion('one two', 0, 'w', 1)).toEqual({ target: 4, start: 0, end: 4 })
    expect(textMotion('one two', 0, 'W', 1)).toEqual({ target: 4, start: 0, end: 4 })
    expect(textMotion('one two', 4, 'b', 1)).toEqual({ target: 0, start: 0, end: 4 })
    expect(textMotion('one two', 4, 'b', 1, true)).toEqual({ target: 0, start: 0, end: 4 })
  })

  it('covers character-find motions and stops when the motion repeats in place', () => {
    expect(textMotion('a.b.c', 0, 'f.', 1)).toEqual({ target: 1, start: 0, end: 2 })
    expect(textMotion('a.b.c', 0, 'f.', 2)).toEqual({ target: 3, start: 0, end: 4 })
    expect(textMotion('a.b.c', 4, 'F.', 1)).toEqual({ target: 3, start: 3, end: 4 })
    expect(textMotion('a.b.c', 0, 't.', 1)).toEqual({ target: 0, start: 0, end: 1 })
    expect(textMotion('a.b.c', 4, 'Tb', 1)).toEqual({ target: 3, start: 3, end: 4 })
    expect(textMotion('abc', 0, 'q', 1)).toBeUndefined()
    expect(textMotion('abc', 0, 'fZ', 1)).toBeUndefined()
  })

  it('resolves text-object motions for delete and change ranges', () => {
    expect(textMotion('one two', 0, 'iw', 1)).toEqual({ target: 0, start: 0, end: 3 })
    expect(textMotion('one two', 1, 'aw', 1)).toEqual({ target: 0, start: 0, end: 4 })
    expect(textMotion('one two', 0, 'iz', 1)).toBeUndefined()
    expect(textMotion('one two', 0, 'aq', 1)).toBeUndefined()
    expect(textMotion('one two', 0, 'i', 1)).toBeUndefined()
    expect(textMotion('one two', 0, 'zw', 1)).toBeUndefined()
    expect(textMotion('one two', 0, 'qz', 1)).toBeUndefined()
  })
})

describe('Vim repeated find motion', () => {
  it('inverts both find directions and preserves the character', () => {
    expect(repeatedFindMotion({ kind: 'f', character: 'x' }, true)).toBe('Fx')
    expect(repeatedFindMotion({ kind: 'F', character: 'x' }, true)).toBe('fx')
    expect(repeatedFindMotion({ kind: 'T', character: 'x' }, true)).toBe('tx')
    expect(repeatedFindMotion({ kind: 't', character: 'x' }, false)).toBe('tx')
    expect(repeatedFindMotion({ kind: 'f', character: 'x' }, false)).toBe('fx')
  })
})

describe('Vim case transformation', () => {
  it('toggles, lowers and uppers each character independently', () => {
    expect(transformCase('aBc', 'toggle')).toBe('AbC')
    expect(transformCase('aBc', 'lower')).toBe('abc')
    expect(transformCase('aBc', 'upper')).toBe('ABC')
  })
})

describe('Vim text difference', () => {
  it('locates inserted, deleted and replaced spans', () => {
    expect(textDifference('abc', 'abc')).toEqual({ start: 3, end: 3, inserted: '' })
    expect(textDifference('ac', 'abc')).toEqual({ start: 1, end: 1, inserted: 'b' })
    expect(textDifference('abc', 'ac')).toEqual({ start: 1, end: 2, inserted: '' })
    expect(textDifference('abc', 'axc')).toEqual({ start: 1, end: 2, inserted: 'x' })
    expect(textDifference('abXcY', 'acY')).toEqual({ start: 1, end: 3, inserted: '' })
    expect(textDifference('aab', 'ab')).toEqual({ start: 1, end: 2, inserted: '' })
  })
})

describe('Vim text changes beyond deletion', () => {
  it('yanks a range, and reports no register for an empty range', () => {
    expect(calculateTextChange('one two', 0, { kind: 'yank', motion: 'w', count: 1 })).toEqual({
      kind: 'yank',
      registerText: 'one ',
    })
    expect(calculateTextChange('one two', 3, { kind: 'yank', motion: 'x', count: 0 })).toEqual({ kind: 'yank' })
  })

  it('changes a range and records the removed text for the register', () => {
    expect(calculateTextChange('one two', 0, { kind: 'change', motion: 'w', count: 1, insertedText: 'X' })).toEqual({
      kind: 'edit',
      start: 0,
      end: 3,
      inserted: 'X',
      nextText: 'X two',
      nextCursor: 0,
      registerText: 'one',
    })
    expect(
      calculateTextChange('one two', 0, { kind: 'change', motion: 'w', count: 1, insertedText: '' }),
    ).toMatchObject({ inserted: '', nextText: ' two', nextCursor: 0, registerText: 'one' })
  })

  it('replaces characters with a repeated character and rejects an empty or overlong range', () => {
    expect(calculateTextChange('abc', 0, { kind: 'replace', count: 2, character: 'x' })).toEqual({
      kind: 'edit',
      start: 0,
      end: 2,
      inserted: 'xx',
      nextText: 'xxc',
      nextCursor: 1,
    })
    expect(calculateTextChange('abc', 2, { kind: 'replace', count: 3, character: 'x' })).toBeUndefined()
    expect(calculateTextChange('abc', 1, { kind: 'replace', count: 0, character: 'x' })).toBeUndefined()
  })

  it('substitutes characters and keeps the removed text in the register', () => {
    expect(calculateTextChange('abc', 1, { kind: 'substitute', count: 2, insertedText: 'Z' })).toEqual({
      kind: 'edit',
      start: 1,
      end: 3,
      inserted: 'Z',
      nextText: 'aZ',
      nextCursor: 1,
      registerText: 'bc',
    })
  })

  it('resolves each insert entry to its edit span', () => {
    expect(calculateTextChange('  abc', 1, { kind: 'insert', entry: 'I', insertedText: 'x' })).toMatchObject({
      start: 2,
      end: 2,
      nextText: '  xabc',
    })
    expect(calculateTextChange('abc', 0, { kind: 'insert', entry: 'A', insertedText: 'x' })).toMatchObject({
      start: 3,
      end: 3,
      nextText: 'abcx',
    })
    expect(calculateTextChange('abc', 0, { kind: 'insert', entry: 'a', insertedText: 'x' })).toMatchObject({
      start: 1,
      end: 1,
      nextText: 'axbc',
    })
    expect(calculateTextChange('abc', 1, { kind: 'insert', entry: 'i', insertedText: 'x' })).toMatchObject({
      start: 1,
      end: 1,
      nextText: 'axbc',
    })
  })

  it('pastes before and after the cursor', () => {
    expect(calculateTextChange('abc', 1, { kind: 'paste', after: true, text: 'XY' })).toEqual({
      kind: 'edit',
      start: 2,
      end: 2,
      inserted: 'XY',
      nextText: 'abXYc',
      nextCursor: 3,
    })
    expect(calculateTextChange('abc', 1, { kind: 'paste', after: false, text: 'XY' })).toEqual({
      kind: 'edit',
      start: 1,
      end: 1,
      inserted: 'XY',
      nextText: 'aXYbc',
      nextCursor: 2,
    })
  })

  it('overwrites without extending past the text', () => {
    expect(calculateTextChange('abc', 0, { kind: 'overwrite', text: 'XY', replaced: 1 })).toEqual({
      kind: 'edit',
      start: 0,
      end: 1,
      inserted: 'XY',
      nextText: 'XYbc',
      nextCursor: 1,
    })
    expect(calculateTextChange('abc', 2, { kind: 'overwrite', text: 'XY', replaced: 5 })).toEqual({
      kind: 'edit',
      start: 2,
      end: 3,
      inserted: 'XY',
      nextText: 'abXY',
      nextCursor: 3,
    })
  })

  it('changes case over a counted range and rejects an empty range', () => {
    expect(calculateTextChange('aBc', 0, { kind: 'case', mode: 'toggle', count: 3 })).toEqual({
      kind: 'edit',
      start: 0,
      end: 3,
      inserted: 'AbC',
      nextText: 'AbC',
      nextCursor: 3,
      edits: [{ start: 0, end: 3, inserted: 'AbC' }],
    })
    expect(calculateTextChange('aBc', 0, { kind: 'case', mode: 'upper', count: 2 })).toMatchObject({ inserted: 'AB' })
    expect(calculateTextChange('aBc', 0, { kind: 'case', mode: 'lower', count: 2 })).toMatchObject({ inserted: 'ab' })
    expect(calculateTextChange('abc', 3, { kind: 'case', mode: 'toggle', count: 1 })).toBeUndefined()
  })

  it('changes case over a motion range and leaves the caret at its start', () => {
    expect(calculateTextChange('foo bar baz', 4, { kind: 'case', mode: 'upper', motion: 'w', count: 1 })).toMatchObject(
      {
        start: 4,
        end: 8,
        inserted: 'BAR ',
        nextText: 'foo BAR baz',
        nextCursor: 4,
      },
    )
    expect(calculateTextChange('foo bar', 4, { kind: 'case', mode: 'upper', motion: 'b', count: 1 })).toMatchObject({
      nextText: 'FOO bar',
      nextCursor: 0,
    })
    expect(calculateTextChange('foo bar', 0, { kind: 'case', mode: 'toggle', motion: 'all', count: 1 })).toMatchObject({
      nextText: 'FOO BAR',
      nextCursor: 0,
    })
    expect(calculateTextChange('foo', 0, { kind: 'case', mode: 'upper', motion: 'fz', count: 1 })).toBeUndefined()
    expect(calculateTextChange('', 0, { kind: 'case', mode: 'upper', motion: 'all', count: 1 })).toBeUndefined()
  })

  it('rewrites case around hyperlinks and across a length change', () => {
    const url = 'https://Example.test'
    const links = [{ start: 2, end: 2 + url.length, url }]
    const text = `ß ${url} ß`
    expect(caseEdits(text, links, 0, text.length, 'upper')).toEqual([
      { start: 0, end: 2, inserted: 'SS ' },
      { start: 2 + url.length, end: text.length, inserted: ' SS' },
    ])
    expect(caseEdits(text, links, 3, 10, 'upper')).toEqual([])
    expect(caseEdits('abc', [], 1, 3, 'upper')).toEqual([{ start: 1, end: 3, inserted: 'BC' }])
    expect(caseEdits('ABC', [], 0, 3, 'upper')).toEqual([])
    expect(
      calculateTextChange(text, 0, { kind: 'case', mode: 'upper', motion: 'all', count: 1 }, false, links),
    ).toMatchObject({ nextText: `SS ${url} SS`, nextCursor: 0 })
  })

  it('replays change and substitute edits through their recorded offset', () => {
    expect(
      calculateTextChange(
        'abc',
        1,
        { kind: 'change', motion: 'x', count: 1, insertedText: 'XY', insertOffset: 0, deleteCount: 1 },
        true,
      ),
    ).toMatchObject({ nextText: 'aXY', nextCursor: 2 })
    expect(
      calculateTextChange(
        'abc',
        1,
        { kind: 'substitute', count: 2, insertedText: 'Z', insertOffset: 0, deleteCount: 0 },
        true,
      ),
    ).toMatchObject({ nextText: 'aZ', nextCursor: 1 })
    expect(
      calculateTextChange(
        'abc',
        1,
        { kind: 'change', motion: 'x', count: 1, insertedText: 'Z', insertOffset: 0, deleteCount: 1 },
        true,
      ),
    ).toMatchObject({ nextText: 'aZ' })
    expect(
      calculateTextChange(
        'abc',
        1,
        { kind: 'substitute', count: 1, insertedText: 'Z', insertOffset: 0, deleteCount: 1 },
        true,
      ),
    ).toMatchObject({ nextText: 'aZ' })
  })

  it('returns undefined when a delete motion matches nothing', () => {
    expect(calculateTextChange('abc', 0, { kind: 'delete', motion: 'fZ', count: 1 })).toBeUndefined()
  })

  it('keeps the caret for an edit that inserts and removes inside the text', () => {
    expect(calculateTextChange('aQc', 1, { kind: 'delete', motion: 'x', count: 1, insertedText: 'QR' })).toMatchObject({
      nextText: 'aQRc',
      nextCursor: 2,
    })
  })

  it('bounds substitute spans and advances the caret by the inserted length', () => {
    expect(calculateTextChange('abc', 1, { kind: 'substitute', count: 1, insertedText: 'Z' })).toEqual({
      kind: 'edit',
      start: 1,
      end: 2,
      inserted: 'Z',
      nextText: 'aZc',
      nextCursor: 1,
      registerText: 'b',
    })
    expect(calculateTextChange('abc', 0, { kind: 'substitute', count: 1, insertedText: 'QR' })).toMatchObject({
      nextText: 'QRbc',
      nextCursor: 1,
    })
  })

  it('advances the insert caret by the inserted length', () => {
    expect(calculateTextChange('abc', 0, { kind: 'insert', entry: 'i', insertedText: 'QR' })).toMatchObject({
      nextText: 'QRabc',
      nextCursor: 1,
    })
    expect(calculateTextChange('abc', 1, { kind: 'insert', entry: 'i', insertedText: '' })).toMatchObject({
      start: 1,
      end: 1,
      nextText: 'abc',
      nextCursor: 1,
    })
  })

  it('omits the register for an empty deletion and keeps the caret in place', () => {
    expect(calculateTextChange('abc', 2, { kind: 'delete', motion: 'x', count: 0 })).toEqual({
      kind: 'edit',
      start: 2,
      end: 2,
      inserted: '',
      nextText: 'abc',
      nextCursor: 2,
    })
    expect(calculateTextChange('one two', 4, { kind: 'delete', motion: 'x', count: 1 })).toMatchObject({
      nextCursor: 4,
    })
  })
})

describe('Vim surround calculation through the command resolver', () => {
  it('resolves a surround delete and change into edits', () => {
    expect(calculateSurround('say "hi" now', 5, { kind: 'surround-delete', target: '"', count: 1 })).toMatchObject({
      nextText: 'say hi now',
      cursor: 4,
    })
    expect(
      calculateSurround('say "hi" now', 5, { kind: 'surround-change', target: '"', delimiter: ')', count: 1 }),
    ).toMatchObject({ nextText: 'say (hi) now' })
  })
})
