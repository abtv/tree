import { describe, expect, it } from 'vitest'
import { horizontalCaretTransition, sameNodeImageTransition } from './vim-caret-transition'

describe('Vim caret transitions', () => {
  it('saves the last traversed text character on a counted image entry and restores it', () => {
    const image = horizontalCaretTransition({ cursor: 0, imageActive: false }, 'right', 99, 3, true)
    expect(image).toEqual({ cursor: 3, imageActive: true, imageTextReturnCursor: 2 })
    expect(horizontalCaretTransition(image, 'left', 2, 3, true)).toEqual({ cursor: 1, imageActive: false })
  })

  it('preserves the return position on repeated image-boundary motions', () => {
    const image = sameNodeImageTransition({ cursor: 1, imageActive: false }, 'enter', 3)
    expect(horizontalCaretTransition(image, 'right', 5, 3, true)).toEqual(image)
    expect(sameNodeImageTransition(image, 'exit', 3)).toEqual({ cursor: 1, imageActive: false })
  })

  it('keeps an image-only node on its sole character', () => {
    for (const direction of ['left', 'right'] as const) {
      expect(horizontalCaretTransition({ cursor: 0, imageActive: true }, direction, 10, 0, true)).toEqual({
        cursor: 0,
        imageActive: true,
        imageTextReturnCursor: undefined,
      })
    }
  })

  it('clamps ordinary text at both ends', () => {
    expect(horizontalCaretTransition({ cursor: 0, imageActive: false }, 'left', 5, 3, false)).toEqual({
      cursor: 0,
      imageActive: false,
    })
    expect(horizontalCaretTransition({ cursor: 2, imageActive: false }, 'right', 5, 3, false)).toEqual({
      cursor: 2,
      imageActive: false,
    })
  })
})
