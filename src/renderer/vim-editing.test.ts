import { describe, expect, it } from 'vitest'
import { firstNonWhitespace, moveWordBackward, moveWordForward } from './vim-editing'

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
