import { describe, expect, it } from 'vitest'
import { changeVimNumber } from './vim-number'

describe('Vim number counters', () => {
  // @requirement PRODUCT.md §20.2.10
  it.each([
    ['count 19 done', 7, 1, 'count 20 done', 7],
    ['count 19 done', 0, -1, 'count 18 done', 7],
    ['1 then 9', 2, 3, '1 then 12', 8],
    ['-1', 1, 1, '0', 0],
    ['0', 0, -1, '-1', 1],
    ['-009', 2, 10, '001', 2],
    ['0077', 0, 1, '0078', 3],
    ['0x0ff', 3, 1, '0x100', 4],
    ['0X0FF', 4, -1, '0X0FE', 4],
    ['0b1000', 2, -1, '0b0111', 5],
    ['0b0', 0, -1, '0b' + '1'.repeat(64), 65],
    ['9007199254740992', 0, 1, '9007199254740993', 15],
    ['18446744073709551615', 0, 1, '-18446744073709551615', 20],
    ['-18446744073709551615', 0, -1, '18446744073709551615', 19],
    ['0X100', 0, -1, '0X0FF', 4],
    ['-0x0f', 0, 1, '-0x10', 4],
    ['18446744073709551616', 0, -1, '18446744073709551615', 19],
  ] as const)('changes %s at %i by %i', (text, cursor, amount, expected, nextCursor) => {
    const edit = changeVimNumber(text, cursor, amount)!

    expect(text.slice(0, edit.start) + edit.inserted + text.slice(edit.end)).toBe(expected)
    expect(edit.nextCursor).toBe(nextCursor)
  })

  it.each([
    ['words', 0],
    ['12 tail', 3],
    ['12', 2],
    ['', 0],
  ] as const)('does nothing without a number at or after %s:%i', (text, cursor) => {
    expect(changeVimNumber(text, cursor, 1)).toBeUndefined()
  })
})
