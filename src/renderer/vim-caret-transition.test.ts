import { describe, expect, it } from 'vitest'
import {
  focusCaretTransition,
  horizontalCaretTransition,
  pointerCaretTransition,
  sameNodeImageTransition,
  verticalCaretTransition,
} from './vim-caret-transition'

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

  it('round trips between a non-final text position and its image with vertical keys', () => {
    const text = { cursor: 1, imageActive: false }
    const entered = verticalCaretTransition(text, 'down', 4, true, true)
    expect(entered).toEqual({
      caret: { cursor: 4, imageActive: true, imageTextReturnCursor: 1 },
      crossNode: false,
      focusCursor: 4,
    })
    expect(verticalCaretTransition(entered.caret, 'up', 4, true, true).caret).toEqual({
      cursor: 1,
      imageActive: false,
    })
  })

  it('preserves an image-only caret and return position at vertical no-op boundaries', () => {
    const image = { cursor: 3, imageActive: true, imageTextReturnCursor: 1 }
    const step = verticalCaretTransition(image, 'down', 3, true, false)
    expect(step.caret).toBe(image)
    expect(step.crossNode).toBe(false)
    expect(focusCaretTransition(image, 0, 3, true, false)).toBe(image)
    const onlyImage = { cursor: 0, imageActive: true }
    expect(verticalCaretTransition(onlyImage, 'up', 0, true, false).caret).toBe(onlyImage)
  })

  it('transfers authority across nodes and never carries the previous image return position', () => {
    const oldImage = { cursor: 4, imageActive: true, imageTextReturnCursor: 1 }
    expect(verticalCaretTransition(oldImage, 'down', 4, true, true).focusCursor).toBe(0)
    expect(focusCaretTransition(oldImage, 2, 5, false, true)).toEqual({
      cursor: 2,
      imageActive: false,
      imageTextReturnCursor: undefined,
    })
    expect(focusCaretTransition(oldImage, 2, 5, true, true, true)).toEqual({
      cursor: 5,
      imageActive: true,
      imageTextReturnCursor: 2,
    })
  })

  it('treats pointer placement as a new caret intent on the selected node', () => {
    const image = { cursor: 4, imageActive: true, imageTextReturnCursor: 1 }
    expect(pointerCaretTransition(image, 2, 4, true)).toEqual({
      cursor: 2,
      imageActive: false,
      imageTextReturnCursor: undefined,
    })
    expect(pointerCaretTransition(image, 4, 4, true)).toEqual({
      cursor: 4,
      imageActive: true,
      imageTextReturnCursor: undefined,
    })
  })
})
