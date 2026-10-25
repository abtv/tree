import { expect, it } from 'vitest'
import fc from 'fast-check'
import { changeVimNumber } from './vim-number'

// @requirement PRODUCT.md §20.2.10
it('changes only the selected decimal and places the cursor on its final digit', () => {
  fc.assert(
    fc.property(fc.integer(), fc.integer({ min: -9999, max: 9999 }), (value, amount) => {
      const text = `prefix ${value} suffix`
      const edit = changeVimNumber(text, 0, amount)!
      const expected = String(BigInt(value) + BigInt(amount))

      expect(text.slice(0, edit.start) + edit.inserted + text.slice(edit.end)).toBe(`prefix ${expected} suffix`)
      expect(edit.nextCursor).toBe(7 + expected.length - 1)
      const reversed = changeVimNumber(edit.inserted, 0, -amount)!
      expect(BigInt(reversed.inserted)).toBe(BigInt(value))
    }),
  )
})
