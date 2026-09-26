import { describe, expect, it } from 'vitest'
import {
  applySurroundEdits,
  surroundDelimiterKey,
  surroundDeleteEdits,
  surroundChangeEdits,
  surroundLineRange,
  surroundPair,
  surroundWrapEdits,
  type VimSurroundEdits,
} from './vim-surround'
import { calculateSurround } from './vim-text-commands'

function apply(text: string, result: VimSurroundEdits | undefined): string {
  return result === undefined ? text : applySurroundEdits(text, result.edits)
}

describe('Vim surround delimiters', () => {
  it('pads the inside for opening keys and not for closing keys', () => {
    expect(surroundPair(')')).toEqual({ open: '(', close: ')' })
    expect(surroundPair('(')).toEqual({ open: '( ', close: ' )' })
    expect(surroundPair('"')).toEqual({ open: '"', close: '"' })
  })

  it('resolves the surround.vim letter aliases and rejects unsupported keys', () => {
    expect(surroundDelimiterKey('b')).toBe(')')
    expect(surroundDelimiterKey('B')).toBe('}')
    expect(surroundDelimiterKey('r')).toBe(']')
    expect(surroundDelimiterKey('a')).toBe('>')
    expect(surroundDelimiterKey('z')).toBeUndefined()
    expect(surroundPair('z')).toBeUndefined()
  })

  it('ignores leading whitespace in the whole-node range used by yss', () => {
    expect(surroundLineRange('  foo')).toEqual({ start: 2, end: 5 })
    expect(surroundLineRange('')).toEqual({ start: 0, end: 0 })
  })
})

describe('Vim surround edits', () => {
  it('wraps a range as two insertions and leaves the caret on the opening delimiter', () => {
    const result = surroundWrapEdits(0, 3, ')')
    expect(result).toEqual({
      edits: [
        { start: 0, end: 0, inserted: '(' },
        { start: 3, end: 3, inserted: ')' },
      ],
      cursor: 0,
    })
    expect(apply('foo bar', result)).toBe('(foo) bar')
    expect(apply('foo bar', surroundWrapEdits(0, 3, '('))).toBe('( foo ) bar')
    expect(surroundWrapEdits(0, 3, 'z')).toBeUndefined()
    expect(surroundWrapEdits(2, 2, ')')).toBeUndefined()
  })

  it('deletes the nearest enclosing pair', () => {
    expect(apply('say "hi" now', surroundDeleteEdits('say "hi" now', 5, '"', 1))).toBe('say hi now')
    expect(apply('a (b) c', surroundDeleteEdits('a (b) c', 3, ')', 1))).toBe('a b c')
    expect(surroundDeleteEdits('no pair here', 3, '"', 1)).toBeUndefined()
  })

  it('strips one padding space only for an opening-bracket target', () => {
    expect(apply('a ( b ) c', surroundDeleteEdits('a ( b ) c', 4, '(', 1))).toBe('a b c')
    expect(apply('a ( b ) c', surroundDeleteEdits('a ( b ) c', 4, ')', 1))).toBe('a  b  c')
  })

  it('changes one pair into another and honors the replacement padding', () => {
    expect(apply('say "hi" now', surroundChangeEdits('say "hi" now', 5, '"', ')', 1))).toBe('say (hi) now')
    expect(apply('say "hi" now', surroundChangeEdits('say "hi" now', 5, '"', '(', 1))).toBe('say ( hi ) now')
    expect(apply('(hi)', surroundChangeEdits('(hi)', 1, ')', '"', 1))).toBe('"hi"')
    expect(surroundChangeEdits('(hi)', 1, ')', 'z', 1)).toBeUndefined()
    expect(surroundChangeEdits('plain', 1, '"', ')', 1)).toBeUndefined()
  })

  it('selects successively outer pairs with a count', () => {
    expect(apply('(a(x)b)', surroundDeleteEdits('(a(x)b)', 3, ')', 1))).toBe('(axb)')
    expect(apply('(a(x)b)', surroundDeleteEdits('(a(x)b)', 3, ')', 2))).toBe('a(x)b')
    expect(surroundDeleteEdits('(x)', 1, ')', 3)).toBeUndefined()
  })

  it('targets the pair enclosing the caret among adjacent pairs', () => {
    expect(apply('(a) (b)', surroundDeleteEdits('(a) (b)', 1, ')', 1))).toBe('a (b)')
    expect(apply('(a) (b)', surroundDeleteEdits('(a) (b)', 5, ')', 1))).toBe('(a) b')
    // Between two pairs the caret encloses neither.
    expect(surroundDeleteEdits('(a) (b)', 3, ')', 1)).toBeUndefined()
  })

  it('ignores an escaped quote when pairing quote delimiters', () => {
    expect(apply('say \\"x\\" "hi" now', surroundDeleteEdits('say \\"x\\" "hi" now', 11, '"', 1))).toBe(
      'say \\"x\\" hi now',
    )
  })

  it('wraps text containing astral characters without splitting them', () => {
    const text = 'a 😀 b'
    expect(apply(text, surroundWrapEdits(2, 4, ')'))).toBe('a (😀) b')
  })

  it('wraps whitespace-only node text for yss', () => {
    const text = '   '
    const range = surroundLineRange(text)
    expect(range).toEqual({ start: 0, end: 3 })
    expect(apply(text, surroundWrapEdits(range.start, range.end, ')'))).toBe('(   )')
  })
})

describe('Vim surround command resolution', () => {
  it('resolves an added surround from a motion range', () => {
    expect(
      calculateSurround('foo bar', 0, { kind: 'surround-add', motion: 'iw', count: 1, delimiter: '"' })?.nextText,
    ).toBe('"foo" bar')
    expect(
      calculateSurround('foo bar', 0, { kind: 'surround-add', motion: 'x', count: 3, delimiter: ')' })?.nextText,
    ).toBe('(foo) bar')
  })

  it('surrounds the whole node text past leading whitespace for yss', () => {
    expect(
      calculateSurround('  foo', 4, { kind: 'surround-add', motion: 'line', count: 1, delimiter: ')' })?.nextText,
    ).toBe('  (foo)')
    expect(calculateSurround('', 0, { kind: 'surround-add', motion: 'line', count: 1, delimiter: ')' })).toBeUndefined()
  })

  it('returns undefined for a motion that matches nothing', () => {
    expect(
      calculateSurround('foo', 0, { kind: 'surround-add', motion: 'fZ', count: 1, delimiter: '"' }),
    ).toBeUndefined()
    expect(calculateSurround('foo', 0, { kind: 'surround-delete', target: '"', count: 1 })).toBeUndefined()
  })
})
