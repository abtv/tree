import { describe, expect, it } from 'vitest'
import { calculateTextChange, parseCount, repeatedFindMotion, textMotion, transformCase } from './vim-text-commands'

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

  it('keeps Unicode case expansion in the calculated edit', () => {
    expect(transformCase('İ', 'lower')).toBe('i̇')
    expect(calculateTextChange('İA', 0, { kind: 'case', mode: 'lower', count: 1 })).toMatchObject({
      start: 0,
      end: 1,
      inserted: 'i̇',
      nextText: 'i̇A',
    })
  })
})
