import { imageTextReturnCursor, moveCharacterCursor } from './vim-editing'

export interface VimCaretState {
  cursor: number
  imageActive: boolean
  imageTextReturnCursor?: number | undefined
}

export interface VimVerticalStep {
  caret: VimCaretState
  crossNode: boolean
  focusCursor: number
}

/** Resolve one vertical key step before asking the store for a different node. */
export function verticalCaretTransition(
  state: VimCaretState,
  direction: 'up' | 'down',
  textLength: number,
  hasAttachment: boolean,
  canCrossNode: boolean,
): VimVerticalStep {
  if (direction === 'down' && hasAttachment && !state.imageActive && state.cursor < textLength) {
    const caret = sameNodeImageTransition(state, 'enter', textLength)
    return { caret, crossNode: false, focusCursor: caret.cursor }
  }
  if (direction === 'up' && hasAttachment && state.imageActive && textLength > 0) {
    const caret = sameNodeImageTransition(state, 'exit', textLength)
    return { caret, crossNode: false, focusCursor: caret.cursor }
  }
  if (!canCrossNode) return { caret: state, crossNode: false, focusCursor: state.cursor }
  return {
    caret: state,
    crossNode: true,
    focusCursor: direction === 'down' && state.imageActive ? 0 : state.cursor,
  }
}

/** A new focus token replaces local image state; an old token is a true no-op. */
export function focusCaretTransition(
  state: VimCaretState,
  focusCursor: number,
  textLength: number,
  hasAttachment: boolean,
  isNewFocus: boolean,
  preferImage = false,
): VimCaretState {
  if (!isNewFocus) return state
  const imageActive = hasAttachment && (preferImage || focusCursor >= textLength)
  return {
    cursor: imageActive ? textLength : Math.max(0, Math.min(focusCursor, Math.max(0, textLength - 1))),
    imageActive,
    imageTextReturnCursor:
      imageActive && preferImage && textLength > 0 ? Math.max(0, Math.min(focusCursor, textLength - 1)) : undefined,
  }
}

/** Pointer placement is an explicit new caret intent, even on the selected node. */
export function pointerCaretTransition(
  state: VimCaretState,
  pointerCursor: number,
  textLength: number,
  hasAttachment: boolean,
): VimCaretState {
  return focusCaretTransition(state, pointerCursor, textLength, hasAttachment, true)
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
