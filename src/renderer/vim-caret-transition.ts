import { imageTextReturnCursor, moveCharacterCursor } from './vim-editing'

export interface VimCaretState {
  cursor: number
  imageActive: boolean
  imageTextReturnCursor?: number | undefined
}

export function sameNodeImageTransition(
  state: VimCaretState,
  action: 'enter' | 'exit',
  textLength: number,
  entryCursor = state.cursor,
): VimCaretState {
  if (action === 'enter') {
    return {
      cursor: textLength,
      imageActive: true,
      imageTextReturnCursor: textLength > 0 ? Math.max(0, Math.min(entryCursor, textLength - 1)) : undefined,
    }
  }
  return {
    cursor: Math.max(0, Math.min(state.imageTextReturnCursor ?? textLength - 1, textLength - 1)),
    imageActive: false,
  }
}

/** A same-node Normal-mode transition; no DOM or store state is read here. */
export function horizontalCaretTransition(
  state: VimCaretState,
  direction: 'left' | 'right',
  count: number,
  textLength: number,
  hasAttachment: boolean,
): VimCaretState {
  if (direction === 'left' && state.imageActive && hasAttachment && textLength > 0) {
    const exited = sameNodeImageTransition(state, 'exit', textLength)
    return {
      cursor: Math.max(0, exited.cursor - (count - 1)),
      imageActive: false,
    }
  }

  const cursor = moveCharacterCursor(state.cursor, direction, textLength, hasAttachment, count)
  const imageActive = hasAttachment && cursor === textLength
  if (!imageActive) return { cursor, imageActive: false }
  if (state.imageActive) return { cursor, imageActive: true, imageTextReturnCursor: state.imageTextReturnCursor }
  return sameNodeImageTransition(
    state,
    'enter',
    textLength,
    direction === 'right' ? imageTextReturnCursor(state.cursor, count, textLength) : undefined,
  )
}
