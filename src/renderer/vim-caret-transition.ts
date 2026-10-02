import { imageTextReturnCursor, moveCharacterCursor } from './vim-editing'
import { normalEditCursor } from './vim-text-commands'

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
    // Mutation triage: any action other than `'enter'` is the exit form, so replacing `'exit'` is a no-op.
    const caret = sameNodeImageTransition(state, 'exit', textLength)
    return { caret, crossNode: false, focusCursor: caret.cursor }
  }
  if (!canCrossNode) return { caret: state, crossNode: false, focusCursor: state.cursor }
  // Mutation triage: an upward crossing with the image active only happens for an image-only node,
  // whose cursor is already `0`, so applying the image reset to both directions gives the same result.
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
  // Mutation triage: the fallback `textLength - 1` is clamped by the same bound, so widening it is a no-op.
  return {
    cursor: Math.max(0, Math.min(state.imageTextReturnCursor ?? textLength - 1, textLength - 1)),
    imageActive: false,
  }
}

/**
 * The caret an edit, replace, or insert-session commit leaves behind. A true no-op (the clamped
 * result matches the prior state exactly) preserves a saved return position rather than
 * recomputing it, so a bare key pressed while already on the image does not discard where a later
 * exit should land; any other result, including a shortening edit that still ends on the image,
 * is treated as a fresh entry.
 */
export function editCaretTransition(
  state: VimCaretState,
  rawCursor: number,
  textLength: number,
  hasAttachment: boolean,
): VimCaretState {
  const cursor = normalEditCursor(rawCursor, textLength, hasAttachment)
  const imageActive = hasAttachment && cursor === textLength
  if (cursor === state.cursor && imageActive === state.imageActive) return state
  if (!imageActive) return { cursor, imageActive: false }
  return sameNodeImageTransition(state, 'enter', textLength, rawCursor)
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
    // Mutation triage: any action other than `'enter'` is the exit form, so replacing `'exit'` is a no-op.
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
  // Mutation triage: a leftward move can reach the image only from a cursor past the text, which a
  // text caret never holds, so computing the entry cursor for both directions gives the same result.
  return sameNodeImageTransition(
    state,
    'enter',
    textLength,
    direction === 'right' ? imageTextReturnCursor(state.cursor, count, textLength) : undefined,
  )
}
