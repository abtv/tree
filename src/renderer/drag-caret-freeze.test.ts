import { describe, expect, it } from 'vitest'
import { freezeCaret, releaseCaret } from './drag-caret-freeze'

describe('freezeCaret and releaseCaret', () => {
  const caret = { cursor: 4, imageActive: false }

  it('returns the captured caret unchanged for its own pointer', () => {
    const freeze = freezeCaret('a', 7, caret)

    expect(releaseCaret(freeze, 7)).toBe(freeze)
    expect(releaseCaret(freeze, 7)?.caret).toEqual(caret)
  })

  it('ignores a release for a different pointer', () => {
    expect(releaseCaret(freezeCaret('a', 7, caret), 8)).toBeUndefined()
  })

  it('releases any freeze when no pointer is given', () => {
    const freeze = freezeCaret('a', 7, caret)

    expect(releaseCaret(freeze, undefined)).toBe(freeze)
  })

  it('has nothing to release without a freeze', () => {
    expect(releaseCaret(undefined, 7)).toBeUndefined()
    expect(releaseCaret(undefined, undefined)).toBeUndefined()
  })

  it('preserves the active image state and its saved return position', () => {
    const imageCaret = { cursor: 12, imageActive: true, imageTextReturnCursor: 3 }
    const freeze = freezeCaret('image-node', 2, imageCaret)

    expect(releaseCaret(freeze, 2)?.caret).toEqual(imageCaret)
  })
})
